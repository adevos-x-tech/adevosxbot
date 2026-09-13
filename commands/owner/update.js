const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, getOwnerName, createFakeContact, channelInfo } = require('../../Adevoslib/messageConfig');
const {
  getSetting, updateSetting,
  addSudo, removeSudo, getSudo,
  isSudo, loadDatabase, saveDatabase,
  getChatData, updateChatData
} = require('../../AdevosAuth/database');
const { addBan, removeBan, isBanned } = require('../../AdevosAuth/isBanned');
const { formatDuration } = require('../../Adevoslib/myfunc');
const { resolvePhoneFromLid, isLidJid } = require('../../AdevosAuth/lidResolver');
const _AS_CFG_DEFAULT = { viewOn: true, reactOn: false, replyOn: false, replyText: '👀 Seen your status!', reactionEmoji: '❤️', randomReactions: true };
function _asReadConfig() {
  try {
    const raw = getSetting('autostatusConfig', null);
    if (raw && typeof raw === 'object') return { ..._AS_CFG_DEFAULT, ...raw };
    return { viewOn: getSetting('autoviewstatus', true), reactOn: getSetting('autostatusreact', false), replyOn: getSetting('autostatusreply', false), replyText: getSetting('autostatusreplytext', _AS_CFG_DEFAULT.replyText), reactionEmoji: getSetting('autostatusemoji', '❤️'), randomReactions: getSetting('autostatusrandom', true) };
  } catch { return { ..._AS_CFG_DEFAULT }; }
}
function _asWriteConfig(cfg) { try { updateSetting('autostatusConfig', cfg); return true; } catch { return false; } }
const {
  postPersonalStatus,
  downloadStatusMedia,
  processQuotedForStatus,
  buildStatusJidList,
} = require('../../AdevosAuth/statusHelper');
const _mcPath = require('path').join(__dirname, '../../data/mychannels.json');

// ============================================================
// ANTIDELETE — merged from ANTIDELETE.js
// ============================================================
const TEMP_MEDIA_DIR = path.join(__dirname, '../../tmp/antidelete');
const MESSAGE_STORE = new Map();
const MAX_PER_CHAT = 100;

function _ensureTempDir() {
  if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Two independent settings:
//   antidelete      → destination: 'off' | 'private'/'on' | 'chat' | 'both'
//   antideletescope → scope:       'all' | 'pm' | 'group'
//
// Scope commands (pm / group / gc) only change the scope, keep existing dest.
// Dest commands (private / chat / both) only change the dest, keep existing scope.
// 'off' disables everything.
function _getEffectiveConfig(chatId) {
  const dest  = String(getSetting('antidelete', 'private')  || 'private').toLowerCase().trim();
  const scope = String(getSetting('antideletescope', 'all') || 'all').toLowerCase().trim();

  if (dest === 'off') return { enabled: false };

  const isGroup = !!(chatId && chatId.endsWith('@g.us'));

  // Scope filter
  if (scope === 'pm'    &&  isGroup) return { enabled: false }; // pm-only: skip groups
  if (scope === 'group' && !isGroup) return { enabled: false }; // group-only: skip DMs

  // Destination
  const resolvedDest = (dest === 'on') ? 'dm' : (dest === 'private') ? 'dm' : dest;
  return { enabled: true, dest: resolvedDest }; // dest: 'dm' | 'chat' | 'both'
}

function storeMessage(chatId, message) {
  if (!chatId || !message?.key?.id) return;
  if (chatId === 'status@broadcast') return;
  const msg = message.message;
  if (!msg) return;
  if (msg.protocolMessage || msg.senderKeyDistributionMessage) return;

  _ensureTempDir();
  if (!MESSAGE_STORE.has(chatId)) MESSAGE_STORE.set(chatId, new Map());
  const chat = MESSAGE_STORE.get(chatId);

  const sender = message.key.participant || message.key.remoteJid;
  const pushName = message.pushName || (sender || '').split('@')[0] || 'Unknown';

  let content = '';
  let mediaType = null;
  if (msg.conversation) content = msg.conversation;
  else if (msg.extendedTextMessage?.text) content = msg.extendedTextMessage.text;
  else if (msg.imageMessage) { mediaType = 'image'; content = msg.imageMessage.caption || ''; }
  else if (msg.videoMessage) { mediaType = 'video'; content = msg.videoMessage.caption || ''; }
  else if (msg.stickerMessage) mediaType = 'sticker';
  else if (msg.audioMessage) mediaType = 'audio';
  else if (msg.documentMessage) { mediaType = 'document'; content = msg.documentMessage.fileName || 'Document'; }

  chat.set(message.key.id, { message, sender, pushName, content, mediaType, chatId, timestamp: Date.now() });

  if (chat.size > MAX_PER_CHAT) {
    const oldest = [...chat.keys()].slice(0, chat.size - MAX_PER_CHAT);
    for (const k of oldest) chat.delete(k);
  }
}

async function handleMessageRevocation(sock, revokeMessage) {
  try {
    const chatId = revokeMessage.key?.remoteJid;
    if (!chatId) return;
    const config = _getEffectiveConfig(chatId);
    if (!config.enabled) return;

    const messageId = revokeMessage.message?.protocolMessage?.key?.id;
    if (!messageId) return;

    const deletedBy = revokeMessage.key?.participant || revokeMessage.key?.remoteJid || '';
    const botNum = (sock.user.id || '').split(':')[0];
    if (deletedBy.includes(botNum)) return;

    const chatStore = MESSAGE_STORE.get(chatId);
    if (!chatStore) return;
    const stored = chatStore.get(messageId);
    if (!stored) return;

    await _sendDeletionNotification(sock, stored, deletedBy, chatId, config);
    chatStore.delete(messageId);
  } catch (err) {
    console.error('[AntiDelete] Revocation error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ANTIEDIT — detects message edits (protocolMessage.editedMessage / type 14)
// ─────────────────────────────────────────────────────────────────────────
function _getAntieditMode() {
  return String(getSetting('antiedit', 'off') || 'off').toLowerCase().trim();
}
function _antieditAppliesTo(chatId) {
  const mode = _getAntieditMode();
  if (mode === 'off') return null;
  const isGroup = chatId.endsWith('@g.us');
  if (mode === 'private' && isGroup) return null;
  if (mode === 'groups' && !isGroup) return null;
  if (!['private', 'groups', 'all'].includes(mode)) return null;
  return mode;
}

function _extractEditedText(editedMsg) {
  if (!editedMsg) return '';
  const m = editedMsg.message || editedMsg;
  if (m?.conversation) return m.conversation;
  if (m?.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m?.imageMessage?.caption) return m.imageMessage.caption;
  if (m?.videoMessage?.caption) return m.videoMessage.caption;
  if (m?.editedMessage) return _extractEditedText(m.editedMessage);
  if (m?.protocolMessage?.editedMessage) return _extractEditedText(m.protocolMessage.editedMessage);
  return '';
}

async function handleMessageEdit(sock, editMsg) {
  try {
    const chatId = editMsg.key?.remoteJid;
    if (!chatId || chatId === 'status@broadcast') return;

    const mode = _antieditAppliesTo(chatId);
    if (!mode) return;

    // Skip bot's own edits
    if (editMsg.key?.fromMe) return;

    const proto = editMsg.message?.protocolMessage;
    if (!proto) return;
    // type 14 = MESSAGE_EDIT in baileys protobuf
    const isEdit = proto.type === 14 || !!proto.editedMessage;
    if (!isEdit) return;
    if (proto.key?.fromMe) return;

    const editedKey = proto.key;
    if (!editedKey?.id) return;

    // Defense in depth: also drop edits authored by the bot's own number
    const editor = editMsg.key?.participant || editMsg.key?.remoteJid || '';
    const botNum = (sock.user?.id || '').split(':')[0].split('@')[0];
    if (botNum && editor.split('@')[0].split(':')[0] === botNum) return;

    const chatStore = MESSAGE_STORE.get(chatId);
    if (!chatStore) return;
    const stored = chatStore.get(editedKey.id);
    if (!stored) return;

    const oldText = stored.content || '(no text)';
    const newText = _extractEditedText(proto.editedMessage) || '(no text)';
    if (oldText.trim() === newText.trim()) return;

    const botName = getBotName();
    const senderPhoneJid = _resolveToPhoneJid(stored.sender);
    const senderTag = senderPhoneJid ? `@${senderPhoneJid.split('@')[0]}` : (stored.pushName || 'Unknown');

    let groupName = '';
    if (chatId.endsWith('@g.us')) {
      try { const meta = await sock.groupMetadata(chatId); groupName = meta?.subject || ''; } catch {}
    }

    const text =
      `╭─❖ *${botName}* ❖─╮\n` +
      `│ ✏️ *MESSAGE EDITED*\n` +
      `│\n` +
      `│ 👤 By: ${senderTag}\n` +
      (groupName ? `│ 👥 In: ${groupName}\n` : `│ 💬 In: DM\n`) +
      `│\n` +
      `│ 📝 *Original:*\n│ ${oldText.split('\n').join('\n│ ')}\n` +
      `│\n` +
      `│ ✨ *Edited to:*\n│ ${newText.split('\n').join('\n│ ')}\n` +
      `╰─────────────╯`;

    const mentions = senderPhoneJid ? [senderPhoneJid] : [];

    // Destination: send to bot owner DM
    const ownerJid = `${botNum}@s.whatsapp.net`;
    await sock.sendMessage(ownerJid, { text, mentions }).catch(() => {});

    // Update stored copy so further edits chain correctly
    stored.content = newText;
  } catch (err) {
    console.error('[AntiEdit] error:', err.message);
  }
}

async function handleMessagesDelete(sock, event) {
  try {
    const keys = event?.keys || [];
    for (const key of keys) {
      const chatId = key.remoteJid;
      if (!chatId) continue;
      const config = _getEffectiveConfig(chatId);
      if (!config.enabled) continue;
      const chatStore = MESSAGE_STORE.get(chatId);
      if (!chatStore) continue;
      const stored = chatStore.get(key.id);
      if (!stored) continue;
      await _sendDeletionNotification(sock, stored, key.participant || chatId, chatId, config);
      chatStore.delete(key.id);
    }
  } catch (err) {
    console.error('[AntiDelete] messages.delete error:', err.message);
  }
}

function _resolveToPhoneJid(jid) {
  if (!jid) return null;
  if (isLidJid(jid)) {
    const phone = resolvePhoneFromLid(jid);
    if (phone) return `${phone}@s.whatsapp.net`;
    return null; // unresolved LID — skip mention
  }
  return jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
}

async function _sendDeletionNotification(sock, stored, deletedBy, chatId, config) {
  try {
    const botName = getBotName();
    const { message, sender, pushName, content, mediaType, timestamp } = stored;
    const fake = createFakeContact(sender || deletedBy);

    // Resolve real phone JIDs for mentions
    const senderPhoneJid = _resolveToPhoneJid(sender);
    const deleterPhoneJid = deletedBy && deletedBy !== sender ? _resolveToPhoneJid(deletedBy) : null;

    // Build mention tag strings — @number (no @s.whatsapp.net suffix)
    const senderTag = senderPhoneJid
      ? `@${senderPhoneJid.split('@')[0]}`
      : pushName;

    // Resolve deleter display name
    let deleterTag = null;
    if (deleterPhoneJid) {
      deleterTag = `@${deleterPhoneJid.split('@')[0]}`;
    } else if (deletedBy && deletedBy !== sender) {
      const storeContact = global.store?.contacts?.[deletedBy];
      deleterTag = storeContact?.name || storeContact?.notify || pushName;
    }

    let groupName = '';
    if (chatId.endsWith('@g.us')) {
      try { const meta = await sock.groupMetadata(chatId); groupName = meta.subject || ''; } catch {}
    }

    const time = new Date(timestamp).toLocaleString('en-US', {
      hour12: true, hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit', year: 'numeric'
    });

    const sameperson = !deletedBy || deletedBy === sender;

    let text = `🗑️ *Deleted Message*\n\n`;
    text += `👤 *From:* ${senderTag}\n`;
    if (!sameperson && deleterTag) text += `🗑️ *Deleted by:* ${deleterTag}\n`;
    text += `🕐 *Time:* ${time}`;
    if (groupName) text += `\n👥 *Group:* ${groupName}`;
    if (content) text += `\n\n${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
    text += `\n\n_Recovered by *${botName}*_ 🤖`;

    const ownerJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const dest = config.dest || 'dm'; // 'dm' | 'chat' | 'both'

    const mentions = [senderPhoneJid, deleterPhoneJid].filter(Boolean);
    const senderLabel = senderPhoneJid ? `@${senderPhoneJid.split('@')[0]}` : pushName;

    const sendToDm   = dest === 'dm'   || dest === 'both';
    const sendToChat = dest === 'chat' || dest === 'both';

    if (sendToDm) {
      await sock.sendMessage(ownerJid, { text, mentions }, { quoted: fake }).catch(() => {});
      if (mediaType && message.message) {
        await _sendMediaBack(sock, message, mediaType, ownerJid, fake, botName, senderLabel).catch(() => {});
      }
    }

    if (sendToChat) {
      const chatTarget = chatId !== ownerJid ? chatId : ownerJid;
      await sock.sendMessage(chatTarget, { text, mentions }, { quoted: fake }).catch(() => {});
      if (mediaType && message.message) {
        await _sendMediaBack(sock, message, mediaType, chatTarget, fake, botName, senderLabel).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[AntiDelete] Notification error:', err.message);
  }
}

async function _sendMediaBack(sock, message, mediaType, target, fake, botName, senderNum) {
  try {
    const msg = message.message;
    const typeMap = { image: 'imageMessage', video: 'videoMessage', audio: 'audioMessage', sticker: 'stickerMessage', document: 'documentMessage' };
    const msgKey = typeMap[mediaType];
    if (!msgKey || !msg[msgKey]) return;

    const dlType = mediaType === 'document' ? 'document' : mediaType === 'sticker' ? 'sticker' : mediaType;
    const stream = await downloadContentFromMessage(msg[msgKey], dlType);
    let buf = Buffer.alloc(0);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

    const caption = `🗑️ *Deleted ${mediaType}*\n\n👤 *From:* ${senderNum}\n\n_Recovered by *${botName}*_ 🤖`;

    if (mediaType === 'image') await sock.sendMessage(target, { image: buf, caption }, { quoted: fake });
    else if (mediaType === 'video') await sock.sendMessage(target, { video: buf, caption, mimetype: 'video/mp4' }, { quoted: fake });
    else if (mediaType === 'audio') await sock.sendMessage(target, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: fake });
    else if (mediaType === 'sticker') await sock.sendMessage(target, { sticker: buf }, { quoted: fake });
    else if (mediaType === 'document') await sock.sendMessage(target, { document: buf, fileName: msg.documentMessage?.fileName || 'file', mimetype: msg.documentMessage?.mimetype || 'application/octet-stream', caption }, { quoted: fake });
  } catch (err) {
    console.error('[AntiDelete] Media resend error:', err.message);
  }
}




module.exports.storeMessage = storeMessage;
module.exports.handleMessageRevocation = handleMessageRevocation;
module.exports.handleMessagesDelete = handleMessagesDelete;
module.exports.handleMessageEdit = handleMessageEdit;

module.exports = [
{
    name: 'update',
    aliases: ['upgrade', 'botupdate'],
    category: 'owner',
    description: 'Check for updates from GitHub and apply without touching your data',
    usage: '.update',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const https   = require('https');
      const http    = require('http');
      const fs      = require('fs');
      const pathMod = require('path');
      const crypto  = require('crypto');
      const { exec } = require('child_process');

      const OWNER      = 'adevos-x-tech';
      const REPO       = 'adevosxbot';
      const BRANCH     = 'main';
      const BOT_DIR    = pathMod.join(__dirname, '..');
      const TMP_DIR    = pathMod.join(BOT_DIR, 'tmp');
      const COMMIT_FILE = pathMod.join(BOT_DIR, 'data', 'last_commit.txt');

      // Dirs/paths that are NEVER touched during smart-copy
      const SKIP_DIRS   = new Set(['node_modules', 'tmp', '.git']);
      const PROTECTED_FILES = new Set(['.env', 'settings.js', 'package-lock.json']);
      const PROTECTED_PREFIXES = ['data/']; // entire data/ dir: session, db, messageStore

      function isProtected(rel) {
        if (PROTECTED_FILES.has(rel)) return true;
        return PROTECTED_PREFIXES.some(p => rel.startsWith(p));
      }

      function fileHash(fp) {
        try { return crypto.createHash('md5').update(fs.readFileSync(fp)).digest('hex'); } catch { return null; }
      }

      function httpGet(url, hdrs = {}, visited = new Set()) {
        return new Promise((resolve, reject) => {
          if (visited.size > 6) return reject(new Error('Too many redirects'));
          visited.add(url);
          const client = url.startsWith('https') ? https : http;
          const req = client.get(url, { headers: { 'User-Agent': 'DAVEX-Updater/2.0', ...hdrs } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
              res.resume();
              return httpGet(new URL(res.headers.location, url).toString(), hdrs, visited).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
          });
          req.on('error', reject);
          req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timed out')); });
        });
      }

      function downloadFile(url, dest, hdrs = {}, visited = new Set()) {
        return new Promise((resolve, reject) => {
          if (visited.size > 6) return reject(new Error('Too many redirects'));
          visited.add(url);
          const client = url.startsWith('https') ? https : http;
          const req = client.get(url, { headers: { 'User-Agent': 'DAVEX-Updater/2.0', ...hdrs } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
              res.resume();
              return downloadFile(new URL(res.headers.location, url).toString(), dest, hdrs, visited).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
          });
          req.on('error', err => { try { fs.unlinkSync(dest); } catch {} reject(err); });
          req.setTimeout(120000, () => { req.destroy(); reject(new Error('Download timed out')); });
        });
      }

      function smartCopy(src, dest, rel, stats) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
          const relEntry = rel ? `${rel}/${entry}` : entry;
          if (SKIP_DIRS.has(entry) && rel === '') continue; // top-level only skip
          const s = pathMod.join(src, entry);
          const d = pathMod.join(dest, entry);
          if (fs.lstatSync(s).isDirectory()) {
            if (SKIP_DIRS.has(entry)) continue;
            smartCopy(s, d, relEntry, stats);
          } else {
            if (isProtected(relEntry)) { stats.skipped++; continue; }
            const srcHash = fileHash(s);
            const dstHash = fileHash(d);
            if (srcHash && srcHash === dstHash) { stats.skipped++; continue; }
            fs.mkdirSync(pathMod.dirname(d), { recursive: true });
            const existed = fs.existsSync(d);
            fs.copyFileSync(s, d);
            existed ? stats.updated++ : stats.added++;
          }
        }
      }

      function runCmd(cmd) {
        return new Promise((resolve, reject) => {
          exec(cmd, { cwd: BOT_DIR }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || stdout || err.message));
            resolve(stdout.trim());
          });
        });
      }

      // ── Start ────────────────────────────────────────────────────────────
      let statusMsg;
      try {
        statusMsg = await sock.sendMessage(chatId, {
          text: buildHint('Checking for updates...')
        }, { quoted: fake });

        // Step 1: Get latest commit from GitHub API
        const apiUrl  = `https://api.github.com/repos/${OWNER}/${REPO}/commits/${BRANCH}`;
        const apiResp = await httpGet(apiUrl);
        let latestSha = null, commitMsg = '';
        if (apiResp.status === 200) {
          try {
            const data = JSON.parse(apiResp.body.toString());
            latestSha = data.sha;
            commitMsg = data.commit?.message?.split('\n')[0] || '';
          } catch {}
        }

        // Step 2: Compare with last known commit
        const lastSha = fs.existsSync(COMMIT_FILE) ? fs.readFileSync(COMMIT_FILE, 'utf8').trim() : null;
        if (latestSha && lastSha && latestSha === lastSha) {
          return sock.sendMessage(chatId, {
            text: buildHint('Already up to date', 'No new updates found'),
            edit: statusMsg.key
          });
        }

        await sock.sendMessage(chatId, {
          text: buildHint('Downloading update...', commitMsg ? commitMsg.slice(0, 60) : 'Latest from main'),
          edit: statusMsg.key
        });

        // Step 3: Download ZIP archive from GitHub
        fs.mkdirSync(TMP_DIR, { recursive: true });
        const zipPath    = pathMod.join(TMP_DIR, 'gh_update.zip');
        const extractDir = pathMod.join(TMP_DIR, 'gh_extract');
        const archiveUrl = `https://github.com/${OWNER}/${REPO}/archive/refs/heads/${BRANCH}.zip`;
        await downloadFile(archiveUrl, zipPath);

        // Step 4: Extract using AdmZip (already in node_modules)
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
        fs.mkdirSync(extractDir, { recursive: true });
        zip.extractAllTo(extractDir, true);

        // GitHub archive has one top-level folder e.g. DAVE-X-ULTRA-main/
        const entries = fs.readdirSync(extractDir);
        const root = (entries.length === 1 && fs.lstatSync(pathMod.join(extractDir, entries[0])).isDirectory())
          ? pathMod.join(extractDir, entries[0])
          : extractDir;

        // Step 5: Smart copy — only changed files, never touches protected paths
        const stats = { updated: 0, added: 0, skipped: 0 };
        smartCopy(root, BOT_DIR, '', stats);

        // Step 6: Save latest commit SHA so next run can detect "already up to date"
        if (latestSha) {
          try { fs.mkdirSync(pathMod.dirname(COMMIT_FILE), { recursive: true }); fs.writeFileSync(COMMIT_FILE, latestSha, 'utf8'); } catch {}
        }

        // Step 7: Install any new dependencies
        await runCmd('npm install --omit=dev --silent');

        // Step 8: Cleanup temp files
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(zipPath); } catch {}

        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Update Applied', fields: [['Updated', String(stats.updated)], ['Added', String(stats.added)], ['Skipped', String(stats.skipped)], ['Note', 'Session and data untouched. Restarting...']] }),
          edit: statusMsg.key
        });

        setTimeout(() => process.exit(0), 1500);

      } catch (err) {
        const errText = err.message?.replace(/https?:\/\/[^\s]+/g, '[URL]').split('\n')[0] || 'Unknown error';
        const failMsg = buildHint(`Update failed: ${errText}`, 'Your data is untouched');
        if (statusMsg?.key) {
          await sock.sendMessage(chatId, { text: failMsg, edit: statusMsg.key }).catch(() => {});
        } else {
          await sock.sendMessage(chatId, { text: failMsg }, { quoted: fake }).catch(() => {});
        }
        console.error('[UPDATE] Failed:', errText);
      }
    }
  }
];
