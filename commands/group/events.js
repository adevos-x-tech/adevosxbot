const crypto = require('crypto');
const { buildFrame } = require('../../Adevoslib/frame');
const _antitagStats = new Map();
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, getChatData, updateChatData, isSudo: _isSudoG } = require('../../AdevosAuth/database');
const isAdmin = require('../../AdevosAuth/isAdmin');
const { setWelcome, removeWelcome, setGoodbye, removeGoodbye } = require('../../AdevosAuth/database');
const { downloadContentFromMessage: _dlContent } = require('@whiskeysockets/baileys');
const { resolvePhoneFromLid } = require('../../AdevosAuth/lidResolver');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// Resolve a target JID to displayable phone number (LID-safe)
function _displayNum(jid, sock) {
  const raw = jid.split('@')[0].split(':')[0];
  if (raw.length > 13) {
    const phone = resolvePhoneFromLid(`${raw}@lid`, sock);
    if (phone && phone !== raw) return phone;
  }
  return raw;
}

// ============================================================
// TOPMEMBERS HELPERS
// ============================================================
const _MC_PATH = path.join(__dirname, '../../data/messageCount.json');
function _loadMC() {
  try { if (fs.existsSync(_MC_PATH)) return JSON.parse(fs.readFileSync(_MC_PATH, 'utf8')); } catch {}
  return { messageCount: {} };
}
function _saveMC(d) {
  const dir = path.dirname(_MC_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(_MC_PATH, JSON.stringify(d, null, 2));
}
function _incrementMC(groupId, userId) {
  const d = _loadMC();
  if (!d.messageCount) d.messageCount = {};
  if (!d.messageCount[groupId]) d.messageCount[groupId] = {};
  d.messageCount[groupId][userId] = (d.messageCount[groupId][userId] || 0) + 1;
  _saveMC(d);
}

// ============================================================
// TOSGROUP HELPERS
// ============================================================
async function _tosDownloadBuf(msg, type) {
  const stream = await _dlContent(msg, type);
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}
async function _tosBuildPayload(quotedMessage, captionText) {
  if (!quotedMessage) return captionText ? { text: captionText } : null;
  if (quotedMessage.imageMessage) return { image: await _tosDownloadBuf(quotedMessage.imageMessage, 'image'), caption: captionText || quotedMessage.imageMessage.caption || '' };
  if (quotedMessage.videoMessage) return { video: await _tosDownloadBuf(quotedMessage.videoMessage, 'video'), caption: captionText || quotedMessage.videoMessage.caption || '' };
  if (quotedMessage.audioMessage) return { audio: await _tosDownloadBuf(quotedMessage.audioMessage, 'audio'), mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg' };
  if (quotedMessage.stickerMessage) return { sticker: await _tosDownloadBuf(quotedMessage.stickerMessage, 'sticker') };
  const txt = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
  const final = captionText || txt || '';
  return final ? { text: final } : null;
}
async function _tosSendGroupStatus(sock, jid, content) {
  const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
  const inside = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
  const messageSecret = crypto.randomBytes(32);
  const m = generateWAMessageFromContent(jid, {
    messageContextInfo: { messageSecret },
    groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
  }, {});
  await sock.relayMessage(jid, m.message, { messageId: m.key.id });
  return m;
}


// ============================================================
// GROUP ANTI-MEDIA HANDLER FUNCTIONS (called from main.cjs)
// ============================================================
const { isSudo } = require('../../AdevosAuth/database');

async function _antiMediaAction(sock, chatId, message, senderId, type, cfg) {
  const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
  if (!isBotAdmin || isSenderAdmin || isSudo(senderId)) return;
  const botName = getBotName();
  const userTag = `@${senderId.split('@')[0]}`;

  // Delete the message
  try {
    await sock.sendMessage(chatId, {
      delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
    });
  } catch (e) { return; }

  if (cfg.action === 'kick') {
    await sock.sendMessage(chatId, {
      text: buildFrame({ title: `Anti${type}`, fields: [['Kicked', userTag], ['Reason', `${type} not allowed here`]] }),
      mentions: [senderId]
    });
    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
  } else if (cfg.action === 'warn') {
    // Track warn count
    const warnKey = `anti_${type}_warn_${senderId.split('@')[0]}`;
    const max = cfg.maxWarnings || 3;
    const count = (getChatData(chatId, warnKey, 0) || 0) + 1;
    updateChatData(chatId, warnKey, count);
    if (count >= max) {
      updateChatData(chatId, warnKey, 0);
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: `Anti${type}`, fields: [['Kicked', userTag], ['Reason', `Max warnings reached (${max})`]] }),
        mentions: [senderId]
      });
    } else {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: `Anti${type}`, fields: [['Warned', userTag], ['Warnings', `${count}/${max}`], ['Reason', `No ${type} allowed here`]] }),
        mentions: [senderId]
      });
    }
  } else {
    // Default: delete — quietly notify
    await sock.sendMessage(chatId, {
      text: buildFrame({ title: `Anti${type}`, fields: [['Deleted', `${userTag}'s ${type}`], ['Reason', `${type}s are not allowed here`]] }),
      mentions: [senderId]
    });
  }
}

async function handleImageDetection(sock, chatId, message, senderId) {
  try {
    // Guard: must be an image in a group
    const isImage = !!(message.message?.imageMessage);
    if (!isImage) return;
    if (!chatId.endsWith('@g.us')) return;

    const cfg = getChatData(chatId, 'antiimage', null);
    if (!cfg?.enabled) return;

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
    if (!isBotAdmin || isSenderAdmin || isSudo(senderId)) return;

    const botName = getBotName();
    const userNum  = senderId.split('@')[0].split(':')[0];
    const userTag  = `@${userNum}`;

    // Delete the message
    try {
      await sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
      });
    } catch (e) {
      console.error('[ANTI-IMAGE] Delete failed:', e.message);
      return;
    }

    const action = cfg.action || 'delete';

    if (action === 'kick') {
      if (!isRateLimited(chatId, senderId, 30000)) {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antiimage', fields: [['Kicked', userTag], ['Reason', 'Images not allowed here']] }),
          mentions: [senderId]
        });
      }
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
    } else if (action === 'warn') {
      const warnKey = `anti_image_warn_${userNum}`;
      const max     = cfg.maxWarnings || 3;
      const count   = (getChatData(chatId, warnKey, 0) || 0) + 1;
      updateChatData(chatId, warnKey, count);
      if (count >= max) {
        updateChatData(chatId, warnKey, 0);
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
        if (!isRateLimited(chatId, senderId, 5000)) {
          await sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Antiimage', fields: [['Kicked', userTag], ['Reason', `Max warnings reached (${max})`]] }),
            mentions: [senderId]
          });
        }
      } else {
        if (!isRateLimited(chatId, senderId, 30000)) {
          await sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Antiimage', fields: [['Warned', userTag], ['Warnings', `${count}/${max}`], ['Reason', 'Images not allowed here']] }),
            mentions: [senderId]
          });
        }
      }
    } else {
      // delete mode — notify once per cooldown window
      if (!isRateLimited(chatId, senderId, 30000)) {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antiimage', fields: [['Deleted', `${userTag}'s image`], ['Reason', 'Images are not allowed here']] }),
          mentions: [senderId]
        });
      }
    }
  } catch (e) {
    console.error('[ANTI-IMAGE] Error:', e.message);
  }
}

// ─── Shared fast anti-media core ────────────────────────────────────────────
// Uses message.key.participant for delete (exact JID WhatsApp assigned),
// _displayNum for LID-safe @tag, and rate-limits notifications only.
async function _antiMediaCore(sock, chatId, message, senderId, cfgKey, label) {
  try {
    if (!chatId.endsWith('@g.us')) return;
    const cfg = getChatData(chatId, cfgKey, null);
    if (!cfg?.enabled) return;

    // Skip newsletter / system JIDs — bot cannot delete their messages
    const senderRaw = (senderId || '').split('@')[0].split(':')[0];
    if ((senderId || '').includes('@newsletter') || senderRaw.length > 13) return;

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
    if (!isBotAdmin || isSenderAdmin || isSudo(senderId)) return;

    const botName  = getBotName();
    const delJid   = message.key.participant || senderId;   // exact JID for delete
    const userNum  = _displayNum(senderId, sock);
    // For unresolved LID JIDs (18-digit raw), show "a member" rather than garbled digits
    const userTag  = userNum.length > 13 ? 'a member' : `@${userNum}`;
    const action   = cfg.action || 'delete';

    // ── Delete first, always ─────────────────────────────────────────────────
    try {
      await sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: delJid }
      });
    } catch (e) {
      console.error(`[ANTI-${cfgKey.toUpperCase()}] Delete failed:`, e.message);
      return;
    }

    // ── Action / notify ──────────────────────────────────────────────────────
    if (action === 'kick') {
      if (!isRateLimited(chatId, senderId, 30000)) {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: `Anti${label}`, fields: [['Kicked', userTag], ['Reason', `${label}s not allowed`]] }),
          mentions: [senderId]
        });
      }
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});

    } else if (action === 'warn') {
      const warnKey = `anti_${cfgKey}_warn_${userNum}`;
      const max     = cfg.maxWarnings || 3;
      const count   = (getChatData(chatId, warnKey, 0) || 0) + 1;
      updateChatData(chatId, warnKey, count);
      if (count >= max) {
        updateChatData(chatId, warnKey, 0);
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
        if (!isRateLimited(chatId, senderId, 5000)) {
          await sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Antiimage', fields: [['Kicked', userTag], ['Reason', `Max warnings reached (${max})`]] }),
            mentions: [senderId]
          });
        }
      } else {
        if (!isRateLimited(chatId, senderId, 30000)) {
          await sock.sendMessage(chatId, {
            text: buildFrame({ title: `Anti${label}`, fields: [['Warned', userTag], ['Warnings', `${count}/${max}`], ['Reason', `No ${label}s allowed here`]] }),
            mentions: [senderId]
          });
        }
      }

    } else {
      // delete mode — notify once per cooldown window
      if (!isRateLimited(chatId, senderId, 30000)) {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: `Anti${label}`, fields: [['Deleted', `${userTag}'s ${label}`], ['Reason', `${label}s are not allowed here`]] }),
          mentions: [senderId]
        });
      }
    }
  } catch (e) {
    console.error(`[ANTI-${cfgKey.toUpperCase()}] Error:`, e.message);
  }
}

async function handleStickerDetection(sock, chatId, message, senderId) {
  if (!message.message?.stickerMessage) return;
  await _antiMediaCore(sock, chatId, message, senderId, 'antisticker', 'sticker');
}

async function handleVideoDetection(sock, chatId, message, senderId) {
  if (!message.message?.videoMessage) return;
  await _antiMediaCore(sock, chatId, message, senderId, 'antivideo', 'video');
}

async function handleAudioDetection(sock, chatId, message, senderId) {
  if (!(message.message?.audioMessage || message.message?.pttMessage)) return;
  await _antiMediaCore(sock, chatId, message, senderId, 'antiaudio', 'audio');
}

async function handleDocumentDetection(sock, chatId, message, senderId) {
  if (!message.message?.documentMessage) return;
  await _antiMediaCore(sock, chatId, message, senderId, 'antidocument', 'document');
}


// ─── Simple rate limiter for antigroupmention ────────────────────────────────
// Uses phone digits so LID and phone JID for the same person share one slot
const _rateLimitMap = new Map();
function isRateLimited(chatId, sender, windowMs = 30000) {
  const senderPhone = (sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  const key = `${chatId}:${senderPhone}`;
  const now = Date.now();
  const last = _rateLimitMap.get(key) || 0;
  if (now - last < windowMs) return true;
  _rateLimitMap.set(key, now);
  if (_rateLimitMap.size > 300) {
    const cutoff = Date.now() - 120000;
    for (const [k, v] of _rateLimitMap) if (v < cutoff) _rateLimitMap.delete(k);
  }
  return false;
}

async function handleAntiStatusMention(sock, m) {
  try {
    if (!m?.message) return;
    if (m.key.fromMe) return;

    const chatId = m.key.remoteJid;
    if (!chatId?.endsWith('@g.us')) return;

    const config = getChatData(chatId, 'antigroupmention', null);
    if (!config || !config.enabled) return;
    const mode = config.action || 'delete';
    if (mode === 'off') return;

    const sender = m.key.participant || m.key.remoteJid;

    const botPhone = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const senderPhone = (sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    if (botPhone && senderPhone && botPhone === senderPhone) return;
    if (isRateLimited(chatId, sender)) return;

    const allKeys = Object.keys(m.message || {})
      .filter(k => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage');
    const primaryType = allKeys[0];
    const isGroupStatusMention = primaryType === 'groupStatusMentionMessage';

    if (!isGroupStatusMention) {
      const ctxInfo = m.message?.extendedTextMessage?.contextInfo ||
                      m.message?.imageMessage?.contextInfo ||
                      m.message?.videoMessage?.contextInfo;
      const isForwarded = ctxInfo?.isForwarded;
      const forwardingScore = ctxInfo?.forwardingScore || 0;
      if (!isForwarded && forwardingScore === 0) return;
    }

    const botName = getBotName();
    const { isSudo } = require('../../AdevosAuth/database');
    const adminStatus = await isAdmin(sock, chatId, sender);
    const isSenderAdmin = adminStatus.isSenderAdmin;
    const isBotAdmin = adminStatus.isBotAdmin;

    if (isSenderAdmin || isSudo(sender)) return;

    if (!isBotAdmin) {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: botName, fields: [['Status', 'I need admin to enforce this']] })
      });
      return;
    }

    const userTag = `@${sender.split('@')[0]}`;

    // Warn mode — send warning, do NOT delete
    if (mode === 'warn') {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antigroupmention', fields: [['Warned', userTag], ['Reason', 'Do not tag this group in status']] }),
        mentions: [sender]
      });
      return;
    }

    // Delete first, then handle kick or confirm
    try {
      await sock.sendMessage(chatId, { delete: m.key });
    } catch (e) {
      return;
    }

    if (mode === 'kick' || mode === 'remove') {
      try {
        await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antigroupmention', fields: [['Kicked', userTag], ['Reason', 'Tagged the group in their status']] }),
          mentions: [sender]
        });
      } catch (e) {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antigroupmention', fields: [['Deleted', `${userTag}'s message`], ['Note', 'Could not remove them (not admin?)']] }),
          mentions: [sender]
        });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antigroupmention', fields: [['Deleted', `${userTag}'s message`], ['Reason', "Don't tag this group"]] }),
        mentions: [sender]
      });
    }
  } catch (err) {
    console.error('AntiGroupMention error:', err.message);
  }
}


/**
 * handleAntiMention — blocks members from @mentioning other members inside
 * the group at all (distinct from handleAntitag, which only fires on mass
 * mass-tagging with 5+ mentions in one message).
 */
async function handleAntiMention(sock, message, context) {
  try {
    const { chatId, senderId, isSenderAdmin, senderIsSudo, isBotAdmin } = context;
    if (!chatId.endsWith('@g.us')) return;

    const cfg = getChatData(chatId, 'antimention', null);
    if (!cfg || !cfg.enabled) return;
    if (!isBotAdmin || isSenderAdmin || senderIsSudo) return;

    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentions.length) return;

    const botName = getBotName();
    const userTag = `@${senderId.split('@')[0]}`;

    try {
      await sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
      });
    } catch (e) { return; }

    if (cfg.action === 'kick') {
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antimention', fields: [['Kicked', userTag], ['Reason', 'Mentioning other members is not allowed']] }),
        mentions: [senderId]
      });
    } else if (cfg.action === 'warn') {
      const warnKey = `anti_mention_warn_${senderId.split('@')[0]}`;
      const max = cfg.maxWarnings || 3;
      const count = (getChatData(chatId, warnKey, 0) || 0) + 1;
      updateChatData(chatId, warnKey, count);
      if (count >= max) {
        updateChatData(chatId, warnKey, 0);
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antimention', fields: [['Kicked', userTag], ['Reason', `Max warnings reached (${max})`]] }),
          mentions: [senderId]
        });
      } else {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antimention', fields: [['Warned', userTag], ['Warnings', `${count}/${max}`], ['Reason', 'Mentioning other members is not allowed']] }),
          mentions: [senderId]
        });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antimention', fields: [['Deleted', `${userTag}'s message`], ['Reason', 'Mentioning other members is not allowed']] }),
        mentions: [senderId]
      });
    }
  } catch (err) {
    console.error('[ANTIMENTION] Error:', err.message);
  }
}

async function handleAntitag(sock, message, context) {
  try {
    const { chatId, senderId, isSenderAdmin, senderIsSudo, isBotAdmin } = context;
    if (!chatId.endsWith('@g.us')) return;

    const cfg = getChatData(chatId, 'antitag', null);
    if (!cfg || !cfg.enabled) return;
    if (!isBotAdmin || isSenderAdmin || senderIsSudo) return;

    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentions.length < 5) return;

    const botName = getBotName();
    const userNum = senderId.split('@')[0].split(':')[0];
    const userTag = `@${userNum}`;

    try {
      await sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
      });
    } catch (e) {
      console.error('[ANTITAG] Delete failed:', e.message);
      return;
    }

    const stats = _antitagStats.get(chatId) || { blocked: 0 };
    stats.blocked++;
    _antitagStats.set(chatId, stats);

    if (cfg.action === 'kick') {
      await sock.sendMessage(chatId, {
        text: `${userTag} kicked for mass tagging!`,
        mentions: [senderId]
      });
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
    } else {
      await sock.sendMessage(chatId, {
        text: `${userTag}, mass tagging is not allowed!`,
        mentions: [senderId]
      });
    }
  } catch (err) {
    console.error('[ANTITAG] Error:', err.message);
  }
}


module.exports = {
  handleAntitag,
  handleAntiMention,
  handleAntiStatusMention,
  handleImageDetection,
  handleStickerDetection,
  handleVideoDetection,
  handleAudioDetection,
  handleDocumentDetection,
};
