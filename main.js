const chalk = require('chalk');
const path = require('path');
const settings = require('./settings.js');
const { getSetting, getCommandData, updateSetting, applyFontStyle } = require('./AdevosAuth/database');
const { channelInfo, getBotName, createFakeContact } = require('./Adevoslib/messageConfig');
const { isLidJid, resolvePhoneFromLid, resolveSenderNumber, cacheLidPhone, numberDisplay } = require('./AdevosAuth/lidResolver');

// Direct access to davexbaileys globalLidMapping for Layer 2 background resolution
let _glmCache = null;
const _getGlm = () => {
  if (_glmCache) return _glmCache;
  try { _glmCache = require('@whiskeysockets/baileys/lib/Utils').globalLidMapping; } catch {}
  return _glmCache;
};

const _C = {
  border  : chalk.hex('#00b4d8'),
  cmdBord : chalk.hex('#e63946'),
  label   : chalk.hex('#90e0ef').bold,
  cmdLbl  : chalk.hex('#ff6b6b').bold,
  value   : chalk.hex('#e0f0ff'),
  tag     : chalk.bgHex('#e63946').white.bold,
  tagM    : chalk.bgHex('#023e8a').white.bold,
};

function _logMsg(label, entries) {
  const W = 34;
  const isCmd = label === 'CMD' || label === 'COMMAND';
  const bd = isCmd ? _C.cmdBord : _C.border;
  const lb = isCmd ? _C.cmdLbl  : _C.label;
  const line = '─'.repeat(W);
  const tagStr = isCmd ? ' ⚡ CMD ' : ' 💬 MSG ';
  const tagFn  = isCmd ? _C.tag : _C.tagM;

  console.log(bd(`╭${line}╮`));
  console.log(bd('│') + tagFn(tagStr) + ' '.repeat(Math.max(0, W - tagStr.length - 1)) + bd('│'));
  console.log(bd(`├${line}┤`));
  for (const [icon, lbl, val] of entries) {
    const valStr   = String(val).substring(0, 22);
    const inner    = ` ${icon} ${lb(lbl + ':')} ${_C.value(valStr)}`;
    const plainLen = ` ${icon} ${lbl}: ${valStr}`.length;
    console.log(bd('│') + inner + ' '.repeat(Math.max(0, W - plainLen - 1)) + bd('│'));
  }
  console.log(bd(`╰${line}╯`));
}
const { isBanned } = require('./AdevosAuth/isBanned');
const isAdmin = require('./AdevosAuth/isAdmin');
const buildContext = require('./Adevoslib/context');
const { extractInteractionText } = require('./Adevoslib/interactive');
const {
  handleAntilink,
  handleAutoEmoji,
  handleWelcome,
  handleAutoReact,
  handleAlwaysOnline,
  handleAutoRead,
  handleChatbot,
  handleAntibadword,
  handleAutotypingForMessage,
  handleAutorecordingForMessage,
} = require('./AdevosAuth/case');

const _processedIds = new Set();
// Track banned users already notified this session (no repeated ban messages)
const _banNotifiedSet = new Set();

async function handleMessage(sock, { messages, type }) {
  // 'notify' = real new message; 'append' = store sync (history)
  // After reconnect, WhatsApp sometimes delivers truly NEW messages as 'append'.
  // Accept 'append' only if the messages are very recent (last 120 s) to
  // avoid replying to old history without dropping legitimate post-reconnect msgs.
  if (type !== 'notify') {
    if (type !== 'append') {
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const hasRecent = messages.some(m => {
      const ts = m.messageTimestamp;
      const t = ts && typeof ts === 'object' ? (ts.low ?? ts.toNumber?.() ?? 0) : (ts || 0);
      return (now - t) < 120;
    });
    if (!hasRecent) {
      return;
    }
  }

  for (const message of messages) {
    try {
      if (!message.message) {
        continue;
      }
      // For append-type batches, skip individual stale messages in the same batch
      if (type === 'append') {
        const ts = message.messageTimestamp;
        const t = ts && typeof ts === 'object' ? (ts.low ?? ts.toNumber?.() ?? 0) : (ts || 0);
        if ((Math.floor(Date.now() / 1000) - t) > 120) {
          continue;
        }
      }
      if (message.key?.id && _processedIds.has(message.key.id)) {
        continue;
      }
      if (message.key?.id) {
        _processedIds.add(message.key.id);
        setTimeout(() => _processedIds.delete(message.key.id), 60000);
      }

      const chatId = message.key?.remoteJid;
      if (!chatId) {
        continue;
      }

      const isGroup = chatId.endsWith('@g.us');
      const isChannel = chatId.endsWith('@newsletter');
      const isFromMe = message.key.fromMe;

      const isStatus = chatId === 'status@broadcast';
      const sender = isFromMe
        ? sock.user?.id
        : (message.key.participant || (isStatus ? null : message.key.remoteJid));

      // Skip status messages where participant is missing — can't identify real sender
      if (!sender || (isStatus && sender === 'status@broadcast')) {
        continue;
      }

      // ── Skip internal WhatsApp protocol packets — not real messages ──
      const _msgTypeRaw = Object.keys(message.message || {})[0] || '';
      if (_msgTypeRaw === 'senderKeyDistributionMessage' || _msgTypeRaw === 'protocolMessage') {
        continue;
      }

      // ── Ban check: block all commands, notify only when a command is used ──
      if (isBanned(sender)) {
        const _rawBanText = extractInteractionText(message).text;
        const _banPrefix = (global.prefix != null) ? global.prefix : getSetting('prefix', '.');
        if (_banPrefix ? _rawBanText.startsWith(_banPrefix) : false) {
          const banKey = sender.split('@')[0].split(':')[0];
          if (!_banNotifiedSet.has(banKey)) {
            _banNotifiedSet.add(banKey);
            await sock.sendMessage(chatId, {
              text: applyFontStyle(`You are *banned* from using this bot. Contact the owner to appeal.`)
            }).catch(() => {});
          }
        }
        continue;
      }

      const mode = getSetting('mode', 'public');
      const { isSudo, getSetting: getS } = require('./AdevosAuth/database');
      const _senderNum = sender.split('@')[0].split(':')[0];
      const _envOwner = settings.ownerNumber || '';
      const _dbOwner = String(getS('ownerNumber', '') || '').trim();
      const senderIsSudo = isFromMe ||
        (_envOwner && _senderNum === _envOwner) ||
        (_dbOwner && _senderNum === _dbOwner) ||
        isSudo(sender);

      // Private mode — block commands only; all automations continue normally
      // Group mode — block commands in DMs; DM mode — block commands in groups
      const blockCommands = (mode === 'private' && !senderIsSudo && !isFromMe) ||
        (mode === 'group' && !isGroup && !senderIsSudo && !isFromMe) ||
        (mode === 'dm' && isGroup && !senderIsSudo && !isFromMe);

      // Build admin status for groups
      let adminStatus = { isSenderAdmin: false, isBotAdmin: false };
      if (isGroup) {
        try {
          adminStatus = await isAdmin(sock, chatId, sender);
        } catch (e) {}
      }

      const context = buildContext(sock, message, {
        isAdminCheck: true,
        adminStatus,
      });

      // Always-online presence
      handleAlwaysOnline(sock).catch(() => {});

      // Auto-read messages
      if (!isFromMe) {
        handleAutoRead(sock, message, context).catch(() => {});
      }

      // --- Anti-delete / anti-group-mention are handled as event listeners in index.js ---

      // Reactions are handled below — skip all auto-features for them
      const isReaction = !!message.message?.reactionMessage;

      // Run auto-features for non-bot, non-reaction messages
      if (!isFromMe && !isReaction) {
        handleAutoEmoji(sock, message, context).catch(() => {});
        handleAutotypingForMessage(sock, chatId).catch(() => {});
        handleAutorecordingForMessage(sock, chatId).catch(() => {});
        handleAutoReact(sock, message, context).catch(() => {});
        if (isGroup) {
          handleAntilink(sock, message, context).catch(() => {});
          handleAntibadword(sock, message, context).catch(() => {});
          const { handleAntiStatusMention, handleAntitag, handleAntiMention } = require('./commands/group/events');
          handleAntiStatusMention(sock, message).catch(() => {});
          handleAntitag(sock, message, context).catch(() => {});
          handleAntiMention(sock, message, context).catch(() => {});
        }
        handleChatbot(sock, message, context).catch(() => {});
      }

      // --- Command Routing ---
      const interaction = extractInteractionText(message);
      const rawText = interaction.text;

      // ── LID → Phone resolution (Dave X multi-layer) ──────────────────────────
      const rawSenderNum = sender.split('@')[0].split(':')[0];
      let senderNum = rawSenderNum;

      if (isLidJid(sender)) {
        // Layer 0: participantPn / senderPn decoded by davexbaileys from WA binary frame
        const _keyPn = message.key?.participantPn || message.key?.senderPn;
        if (_keyPn) {
          const _keyNum = String(_keyPn).split('@')[0].replace(/[^0-9]/g, '');
          if (/^\d{7,15}$/.test(_keyNum) && _keyNum !== rawSenderNum) {
            senderNum = _keyNum;
            cacheLidPhone(rawSenderNum, _keyNum);
          }
        }

        // Layer 1: sync cache + globalLidMapping (only if Layer 0 didn't resolve)
        if (senderNum === rawSenderNum) {
          const resolved = resolvePhoneFromLid(sender, sock);
          if (resolved && /^\d{7,15}$/.test(resolved)) {
            senderNum = resolved;
          } else {
            // Layers 2-4 run in background — populate cache for next message, don't block commands
            const _lidNum = rawSenderNum;
            const _chatId = chatId;
            setImmediate(async () => {
              try {
                // Layer 2: globalLidMapping (davexbaileys API)
                const _glm = _getGlm();
                for (const fmt of [sender, `${_lidNum}@lid`, `${_lidNum}:0@lid`]) {
                  const pn = _glm?.getPnFromLid?.(fmt);
                  if (pn) {
                    const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
                    if (num.length >= 7 && num.length <= 15 && num !== _lidNum) {
                      cacheLidPhone(_lidNum, num);
                      return;
                    }
                  }
                }
                // Layer 3: store contacts
                const _store = global.store;
                if (_store?.contacts) {
                  const contact = _store.contacts[sender] || _store.contacts[`${_lidNum}@s.whatsapp.net`];
                  if (contact?.id) {
                    const cnum = contact.id.split('@')[0].split(':')[0];
                    if (/^\d{7,15}$/.test(cnum) && cnum !== _lidNum) { cacheLidPhone(_lidNum, cnum); return; }
                  }
                }
                // Layer 4: scan group participants for p.lid match
                if (_chatId?.endsWith('@g.us')) {
                  try {
                    const meta = await sock.groupMetadata(_chatId);
                    for (const p of (meta?.participants || [])) {
                      const pLidNum   = (p.lid || '').split('@')[0].split(':')[0];
                      const pPhoneNum = (p.id  || '').split('@')[0].split(':')[0];
                      if (pLidNum === _lidNum && /^\d{7,15}$/.test(pPhoneNum) && pPhoneNum !== _lidNum) {
                        cacheLidPhone(_lidNum, pPhoneNum);
                        return;
                      }
                    }
                  } catch {}
                }
              } catch {}
            });
          }
        }
      }

      // Cache push names globally so VCF, goodbye, and other modules can find real names
      if (message.pushName) {
        if (!global.pushNameCache) global.pushNameCache = new Map();
        global.pushNameCache.set(rawSenderNum, message.pushName);
        if (senderNum !== rawSenderNum) global.pushNameCache.set(senderNum, message.pushName);
      }

      const pushName = isFromMe
        ? getBotName()
        : (message.pushName
            || global.pushNameCache?.get?.(senderNum)
            || global.pushNameCache?.get?.(rawSenderNum)
            || senderNum);
      const mtype = interaction.type || Object.keys(message.message || {})[0] || 'unknown';

      // ── Track message activity for .getparticipants / .listonline ──
      if (chatId?.endsWith('@g.us') && !isFromMe) {
        try {
          const { incrementMessageCount } = require('./Adevoslib/messageStats');
          incrementMessageCount(chatId, sender);
        } catch (_) {}
      }

      // ── DM Antilink + auto-block unknown senders ──
      if (chatId && !chatId.endsWith('@g.us') && chatId !== 'status@broadcast' && !isFromMe && !senderIsSudo) {
        try {
          const { getSetting: _getS } = require('./AdevosAuth/database');
          const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
          const hasLink = /https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com/i.test(rawText);
          const autoBlockUnknown = _getS('autoBlockUnknown', false);
          const antiDmLink = _getS('antidmlink', false);

          let knownContact = false;
          try {
            knownContact = !!(sock.store?.contacts?.[chatId]?.name || sock.store?.contacts?.[chatId]?.notify);
          } catch (_) {}

          if (antiDmLink && hasLink && !knownContact) {
            await sock.updateBlockStatus(chatId, 'block').catch(() => {});
            console.log(`[ANTIDMLINK] Blocked ${chatId} for sending an untrusted link in DM`);
            continue;
          }
          if (autoBlockUnknown && !knownContact) {
            await sock.updateBlockStatus(chatId, 'block').catch(() => {});
            console.log(`[AUTOBLOCK] Blocked unknown DM sender ${chatId}`);
            continue;
          }
        } catch (_) {}
      }
      const preview = rawText || `[${mtype.replace('Message', '')}]`;
      const chatLabel = isGroup ? `GROUP` : `DM`;

      _logMsg('MESSAGE', [
        ['🕐', 'TIME', new Date().toLocaleTimeString()],
        ['📡', 'CONTENT', preview.substring(0, 50) + (preview.length > 50 ? '...' : '')],
        ['👤', 'USER', pushName],
        ['🔢', 'NUMBER', numberDisplay(senderNum === rawSenderNum && isLidJid(sender) ? null : senderNum, sender)],
        ['💬', 'CHAT', isStatus ? 'STATUS' : isGroup ? 'GROUP' : 'PRIVATE'],
        ['📱', 'TYPE', mtype.replace('Message', '')],
      ]);

      // Group anti-media handlers
      if (isGroup && !isFromMe) {
        const { handleImageDetection, handleStickerDetection, handleVideoDetection, handleAudioDetection, handleDocumentDetection } = require('./commands/group/events');
        if (mtype === 'imageMessage' && handleImageDetection) handleImageDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'stickerMessage' && handleStickerDetection) handleStickerDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'videoMessage' && handleVideoDetection) handleVideoDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'audioMessage' && handleAudioDetection) handleAudioDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'documentMessage' && handleDocumentDetection) handleDocumentDetection(sock, chatId, message, sender).catch(() => {});
      }

      // ── Sticker commands — a bound sticker silently triggers its command ──
      if (mtype === 'stickerMessage' && !isFromMe) {
        try {
          const { matchStickerCommand } = require('./commands/owner/stickercmd');
          const boundCmd = matchStickerCommand(message.message.stickerMessage);
          if (boundCmd) {
            const command = global.commands?.get(boundCmd) || global.aliases?.get(boundCmd);
            if (command && (!command.ownerOnly || senderIsSudo) && (!command.groupOnly || isGroup)) {
              command.execute(sock, message, [], context).catch(e =>
                console.error(chalk.red('[STICKERCMD ERROR]'), e.message)
              );
            }
          }
        } catch (_) {}
      }

      // ── Emoji reaction on a status → auto-save silently (any emoji) ──
      const _reactionMsgForSave = message.message?.reactionMessage;
      if (_reactionMsgForSave && !isFromMe && _reactionMsgForSave.text) {
        const _origChat = _reactionMsgForSave.key?.remoteJid;
        if (_origChat === 'status@broadcast') {
          try {
            const _origId = _reactionMsgForSave.key?.id;
            const _origMsg = await global.store?.loadMessage(_origChat, _origId);
            if (_origMsg?.message) {
              const { saveMediaOrText } = require('./commands/tools/save');
              await saveMediaOrText(sock, _origMsg.message, sender).catch(() => {});
            }
          } catch (_) {}
        }
      }

      // ── Emoji reaction → auto-steal view-once silently ──
      const VV_REACTION_EMOJIS = new Set(['😘', '😂', '😶‍🌫️', '😚', '♥️', '❤️', '✅', '🫦', '🥵', '👀']);
      const reactionMsg = message.message?.reactionMessage;
      if (reactionMsg && !isFromMe) {
        const reactEmoji = reactionMsg.text || '';
        if (VV_REACTION_EMOJIS.has(reactEmoji)) {
          const originalId = reactionMsg.key?.id;
          const originalChat = reactionMsg.key?.remoteJid || chatId;
          try {
            const originalMsg = await global.store?.loadMessage(originalChat, originalId);
            if (originalMsg?.message) {
              const origKeys = Object.keys(originalMsg.message);
              const isViewOnce = origKeys.some(k =>
                ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'].includes(k)
              );
              if (isViewOnce) {
                const { downloadViewOnce } = require('./commands/group/view-once');
                const vvPayload =
                  originalMsg.message.viewOnceMessage?.message ||
                  originalMsg.message.viewOnceMessageV2?.message ||
                  originalMsg.message.viewOnceMessageV2Extension?.message;
                if (vvPayload) {
                  const dl = await downloadViewOnce(vvPayload);
                  if (dl) {
                    const { buffer, mediaType, meta } = dl;
                    const sendObj = mediaType === 'imageMessage'
                      ? { image: buffer }
                      : mediaType === 'videoMessage'
                        ? { video: buffer, mimetype: 'video/mp4' }
                        : { audio: buffer, mimetype: 'audio/mpeg', ptt: meta?.ptt || false };
                    const ownerNum = getSetting('ownerNumber', '');
                    const privateJid = ownerNum
                      ? `${ownerNum.replace(/[^0-9]/g, '')}@s.whatsapp.net`
                      : sender;
                    await sock.sendMessage(privateJid, sendObj).catch(() => {});
                  }
                }
              }
            }
          } catch (_) {}
        }
        continue; // Reactions are never commands — stop processing here
      }

      // ── Reply-handler hook (fancy, quiz, etc.) ───────────────────────────────
      {
        const quotedStanzaId = message.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (quotedStanzaId && global.replyHandlers?.has(quotedStanzaId)) {
          const handler = global.replyHandlers.get(quotedStanzaId);
          try { await handler(message); } catch (e) { console.error('[ReplyHandler]', e.message); }
          continue;
        }
        // Fallback: match by sender+chat key (handles Baileys stanzaId mismatch
        // edge cases). Different files may have registered this key using
        // slightly different sender formats (raw vs. cleaned JID), so try a
        // few variants, then finally fall back to chat-only (last resort —
        // safe because reply flows are effectively one-at-a-time per chat).
        const senderNum = (sender || '').split('@')[0].split(':')[0];
        const candidateKeys = [
          `${sender}:${chatId}`,
          `${senderNum}@s.whatsapp.net:${chatId}`,
          `${senderNum}@lid:${chatId}`,
          chatId,
        ];
        let matchedFallback = false;
        for (const key of candidateKeys) {
          if (global.replyHandlers?.has(key)) {
            const handler = global.replyHandlers.get(key);
            try { await handler(message); } catch (e) { console.error('[ReplyHandler]', e.message); }
            matchedFallback = true;
            break;
          }
        }
        if (matchedFallback) continue;
      }

      // Block commands for non-sudo users in private mode
      if (blockCommands) continue;

      const prefix = (global.prefix != null) ? global.prefix : getSetting('prefix', '.');
      if (prefix && !rawText.startsWith(prefix)) continue;

      const body = rawText.slice(prefix.length).trim();
      if (!body) continue;

      const parts = body.split(/\s+/);
      const commandName = parts[0].toLowerCase();
      const args = parts.slice(1);

      _logMsg('COMMAND', [
        ['⚡', 'CMD', commandName],
        ['📝', 'ARGS', args.join(' ') || '(none)'],
        ['👤', 'FROM', pushName],
        ['🔢', 'NUMBER', numberDisplay(senderNum === rawSenderNum && isLidJid(sender) ? null : senderNum, sender)],
        ['💬', 'CHAT', chatLabel],
      ]);

      let command = global.commands?.get(commandName) || global.aliases?.get(commandName);
      if (!command) continue;

      if (!isFromMe && !senderIsSudo && command.noprefix) continue;

      // Check if command is owner-only
      if (command.ownerOnly && !senderIsSudo) {
        const botName = getBotName();
        const fake = createFakeContact(message);
        await sock.sendMessage(chatId, {
          text: applyFontStyle(`╭─*\`${botName}\`*\n├─*Access:*\n│    └ Owner only command\n╰──────────────`)
        }, { quoted: fake });
        continue;
      }

      // Check if group-only command
      if (command.groupOnly && !isGroup) {
        const botName = getBotName();
        const fake = createFakeContact(message);
        await sock.sendMessage(chatId, {
          text: applyFontStyle(`╭─*\`${botName}\`*\n├─*Access:*\n│    └ Group only command\n╰──────────────`)
        }, { quoted: fake });
        continue;
      }

      // Font proxy: wrap sock so ALL plugin sock.sendMessage calls apply the set font.
      // Skip text that already uses frame.js's box-drawing characters —
      // applying a font wrapper (e.g. bold: *text*) on top of an
      // already-formatted frame breaks the layout, since the font wrapper
      // operates per-line and doesn't know the box's own *, `, and ─/│/╭/╰
      // characters are structural, not plain prose.
      const _hasFrameChars = (t) => /[╭╮╰╯│├┤─]/.test(t);
      const _fontSock = new Proxy(sock, {
        get(target, prop) {
          if (prop === 'sendMessage') {
            return (jid, content, opts) => {
              if (content && typeof content === 'object' && !Buffer.isBuffer(content)) {
                if (typeof content.text === 'string' && !_hasFrameChars(content.text)) {
                  content = { ...content, text: applyFontStyle(content.text) };
                }
                if (typeof content.caption === 'string' && !_hasFrameChars(content.caption)) {
                  content = { ...content, caption: applyFontStyle(content.caption) };
                }
              }
              return target.sendMessage(jid, content, opts);
            };
          }
          return Reflect.get(target, prop);
        }
      });

      try {
        await command.execute(_fontSock, message, args, context);
      } catch (err) {
        console.error(chalk.red(`[CMD ERROR] ${commandName}: ${err.message}`));
        const fake = createFakeContact(message);
        await sock.sendMessage(chatId, {
          text: applyFontStyle(`Error running command: ${err.message}`)
        }, { quoted: fake }).catch(() => {});
      }

    } catch (error) {
      console.error(chalk.red('[MAIN ERROR]:'), error.message);
    }
  }
}

async function handleGroupUpdate(sock, update) {
  try {
    const { id, participants, action, author } = update;
    if (!id || !participants || !action) return;
    const { handleWelcome } = require('./AdevosAuth/case');
    await handleWelcome(sock, id, participants, action);

    // ── Antileave: re-add members who left on their own (not kicked) ──
    if (action === 'remove') {
      try {
        const { getChatData } = require('./AdevosAuth/database');
        const cfg = getChatData(id, 'antileave', { enabled: false });
        if (cfg.enabled) {
          const selfLeft = participants.filter(p => p === author);
          if (selfLeft.length) {
            const meta = await sock.groupMetadata(id).catch(() => null);
            const botIsAdmin = meta?.participants?.some(p =>
              (p.id.split('@')[0].split(':')[0] === (sock.user.id || '').split(':')[0]) && p.admin
            );
            if (botIsAdmin) {
              await sock.groupParticipantsUpdate(id, selfLeft, 'add').catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error('[Antileave] error:', e.message);
      }
    }
  } catch (error) {
    console.error('[Welcome] error:', error.message);
  }
}

module.exports = { handleMessage, handleGroupUpdate };
