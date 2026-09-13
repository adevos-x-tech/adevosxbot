const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame } = require('../../Adevoslib/frame');
const { getSetting } = require('../../AdevosAuth/database');
const { resolvePhoneFromLid, isLidJid } = require('../../AdevosAuth/lidResolver');

// ============================================================
// commands/owner/events.js
//
// Canonical antidelete/antiedit detection + notification logic.
// Previously this exact block was duplicated in full inside both
// antidelete.js and antiedit.js, and BOTH copies were silently killed by
// the same bug: `module.exports.storeMessage = ...` etc was set, then
// immediately overwritten by a trailing `module.exports = [ {command} ]`.
// index.js requires storeMessage/handleMessageRevocation/handleMessagesDelete/
// handleMessageEdit from this exact path — so antidelete/antiedit capture
// has not been running. This file now owns that logic exclusively; the
// two command files just read/write the settings it reads.
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

    const text = buildFrame({
      title: 'Message Edited',
      fields: [
        ['By', senderTag],
        ['In', groupName || 'DM'],
        ['Original', oldText],
        ['Edited to', newText],
      ],
    });

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

    const fields = [['From', senderTag]];
    if (!sameperson && deleterTag) fields.push(['Deleted by', deleterTag]);
    fields.push(['Time', time]);
    if (groupName) fields.push(['Group', groupName]);
    if (content) fields.push(['Content', `${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`]);
    const text = buildFrame({ title: 'Deleted Message', fields });

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

    const caption = buildFrame({ title: `Deleted ${mediaType}`, fields: [['From', senderNum]] });

    if (mediaType === 'image') await sock.sendMessage(target, { image: buf, caption }, { quoted: fake });
    else if (mediaType === 'video') await sock.sendMessage(target, { video: buf, caption, mimetype: 'video/mp4' }, { quoted: fake });
    else if (mediaType === 'audio') await sock.sendMessage(target, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: fake });
    else if (mediaType === 'sticker') await sock.sendMessage(target, { sticker: buf }, { quoted: fake });
    else if (mediaType === 'document') await sock.sendMessage(target, { document: buf, fileName: msg.documentMessage?.fileName || 'file', mimetype: msg.documentMessage?.mimetype || 'application/octet-stream', caption }, { quoted: fake });
  } catch (err) {
    console.error('[AntiDelete] Media resend error:', err.message);
  }
}

module.exports = {
  storeMessage,
  handleMessageRevocation,
  handleMessagesDelete,
  handleMessageEdit,
};
