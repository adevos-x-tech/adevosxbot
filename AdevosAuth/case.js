const { getSetting, updateSetting, getChatData, updateChatData, getCommandData, isSudo } = require('./database');
const { getBotName, createFakeContact, getChannelInfo } = require('../Adevoslib/messageConfig');
const { buildFrame, replyOpts } = require('../Adevoslib/frame');
const isAdmin = require('./isAdmin');
const fs = require('fs');
const path = require('path');
const { resolvePhoneFromLid, resolveSenderFromGroup, isLidJid, cacheLidPhone } = require('./lidResolver');
const store = require('../Adevoslib/lightweight');
const { getCurrentTimezone } = require('../Adevoslib/myfunc');

const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp/antidelete');

// ============================
// AUTOLINK HANDLER
// ============================
const handleAntilink = async (sock, message, context) => {
  try {
    const { chatId, isGroup, isSenderAdmin, isBotAdmin, senderIsSudo, senderId } = context;
    if (!isGroup) return;

    const antilinkData = getChatData(chatId, 'antilink', false);
    if (!antilinkData) return;

    const cfg = typeof antilinkData === 'object' ? antilinkData : { enabled: true, action: 'delete', allowedLinks: [] };
    if (!cfg.enabled) return;

    if (isSenderAdmin || senderIsSudo) return;
    if (!isBotAdmin) return;

    // Trusted users (excluded via `.antilink exclude @user`) are exempt too
    const senderPlainNum = (senderId || '').split('@')[0].split(':')[0];
    if ((cfg.trustedUsers || []).includes(senderPlainNum)) return;

    // Extract text from ALL message types
    const msg = message.message || {};
    const rawText = (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      msg.buttonsResponseMessage?.selectedDisplayText ||
      msg.listResponseMessage?.title || ''
    );

    const urlRegex = /(?:https?:\/\/|ftp:\/\/)[^\s<>"{}|\\^\x60\[\]]+|(?:www\.|(?:discord\.gg|t\.me|telegram\.me|bit\.ly|goo\.gl|tinyurl\.com|ow\.ly|rb\.gy|cutt\.ly|short\.io|lnkd\.in|buff\.ly|youtu\.be|youtube\.com|fb\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|chat\.whatsapp\.com|whatsapp\.com|wa\.me|linktr\.ee|vm\.tiktok\.com|pastebin\.com|github\.com|gitlab\.com|t\.co|snap\.com)\/)[^\s<>"{}|\\^\x60\[\]]+/gi;

    if (!urlRegex.test(String(rawText || ''))) return;

    const allowed = (cfg.allowedLinks || []).some(a =>
      rawText.toLowerCase().includes(a.toLowerCase())
    );
    if (allowed) return;

    const action = cfg.action || 'delete';
    const senderNum = (senderId || '').split('@')[0];
    const botName = getBotName();
    const fake = createFakeContact(message);

    await sock.sendMessage(chatId, { delete: message.key }).catch(() => {});

    if (action === 'kick') {
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antilink', fields: [['Kicked', `@${senderNum}`], ['Reason', 'Link sharing not allowed']] }),
        mentions: [senderId]
      }, { quoted: fake });
    } else if (action === 'warn') {
      const warnKey = 'alwarn_' + senderNum;
      const warnCfg = getCommandData('antilink_warns', chatId, {});
      const count = (warnCfg[senderNum] || 0) + 1;
      const maxWarns = cfg.maxWarnings || 3;
      warnCfg[senderNum] = count;
      updateChatData(chatId, 'antilink_warns', JSON.stringify(warnCfg));

      if (count >= maxWarns) {
        warnCfg[senderNum] = 0;
        updateChatData(chatId, 'antilink_warns', JSON.stringify(warnCfg));
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antilink', fields: [['Kicked', `@${senderNum}`], ['Reason', `Max warnings (${maxWarns}) reached`]] }),
          mentions: [senderId]
        }, { quoted: fake });
      } else {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antilink', fields: [['Warned', `@${senderNum}`], ['Warnings', `${count}/${maxWarns}`], ['Reason', 'Links are not allowed here']] }),
          mentions: [senderId]
        }, { quoted: fake });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antilink', fields: [['Deleted', `@${senderNum}'s link`], ['Reason', 'Links are not allowed here']] }),
        mentions: [senderId]
      }, { quoted: fake });
    }
  } catch (error) {
    console.error('AntiLink error:', error.message);
  }
};

// ============================
// AUTOEMOJI HANDLER
// ============================
const handleAutoEmoji = async (sock, message, context) => {
  try {
    const autoemojiMode = getSetting('autoemoji', 'off');
    if (autoemojiMode === 'off') return;

    const { chatId, isGroup, isFromOwner, senderIsSudo } = context;
    if (isFromOwner || senderIsSudo) return;
    if (autoemojiMode === 'dm' && isGroup) return;
    if (autoemojiMode === 'group' && !isGroup) return;

    let emojis = getSetting('autoemojiList', []);
    if (!Array.isArray(emojis) || emojis.length === 0) {
      emojis = ['🔥', '❤', '💯', '🤖', '✨', '🙏'];
    }

    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    await sock.sendMessage(chatId, {
      react: { text: emoji, key: message.key }
    });
  } catch (error) {
    console.error('AutoEmoji error:', error.message);
  }
};

// ============================
// WELCOME / GOODBYE HANDLERS (Dave X pattern)
// ============================

// Resolve a phone number for a participant JID (Dave X 5-layer approach)
const _resolveParticipantName = async (sock, participantJid, groupParticipants) => {
  if (!participantJid) return 'Member';
  const { resolvePhoneFromLid, isLidJid: _isLid, cacheLidPhone } = require('./lidResolver');
  const store = require('../Adevoslib/lightweight');
  const raw = participantJid.split('@')[0].split(':')[0];

  // Layer 0: not a LID — raw is the phone
  if (!_isLid(participantJid)) return /^\d{7,15}$/.test(raw) ? raw : 'Member';

  // Layer 1: fast in-memory LID cache
  const fast = resolvePhoneFromLid(participantJid, sock);
  if (fast && /^\d{7,15}$/.test(fast) && fast !== raw) return fast;

  // Layer 2: scan group participants — only accept @s.whatsapp.net entries whose p.lid matches
  if (groupParticipants) {
    for (const p of groupParticipants) {
      const pIdFull = p.id || '';
      const pIsPhone = pIdFull.endsWith('@s.whatsapp.net');
      if (!pIsPhone) continue; // skip LID JID entries
      const pid  = pIdFull.split('@')[0].split(':')[0];
      const pLid = (p.lid || '').split('@')[0].split(':')[0];
      if (pLid === raw && /^\d{7,15}$/.test(pid)) {
        cacheLidPhone(raw, pid);
        return pid;
      }
    }
    // Layer 2b: check phoneNumber field on the participant whose id IS the target LID
    for (const p of groupParticipants) {
      const pid = (p.id || '').split('@')[0].split(':')[0];
      if (pid === raw && p.phoneNumber) {
        const phone = String(p.phoneNumber).replace(/[^0-9]/g, '');
        if (/^\d{7,15}$/.test(phone)) { cacheLidPhone(raw, phone); return phone; }
      }
    }
  }

  // Layer 3: signalRepository LID mapping
  try {
    if (sock?.signalRepository?.lidMapping?.getPNForLID) {
      for (const fmt of [participantJid, `${raw}:0@lid`, `${raw}@lid`]) {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(fmt).catch(() => null);
        if (pn) {
          const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
          if (num.length >= 7 && num.length <= 15 && num !== raw) { cacheLidPhone(raw, num); return num; }
        }
      }
    }
  } catch {}

  // Layer 4: globalLidMapping
  try {
    const { globalLidMapping } = require('@whiskeysockets/baileys/lib/Utils');
    for (const fmt of [participantJid, `${raw}@lid`]) {
      const pn = globalLidMapping?.getPnFromLid?.(fmt);
      if (pn) {
        const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
        if (num.length >= 7 && num.length <= 15 && num !== raw) { cacheLidPhone(raw, num); return num; }
      }
    }
  } catch {}

  // Layer 5: scan ALL groups for a participant where p.id is phone and p.lid matches
  try {
    const allGroups = await sock.groupFetchAllParticipating().catch(() => ({}));
    for (const gid of Object.keys(allGroups)) {
      for (const p of (allGroups[gid]?.participants || [])) {
        const pIdFull = p.id || '';
        const pIsPhone = pIdFull.endsWith('@s.whatsapp.net');
        if (!pIsPhone) continue;
        const pid  = pIdFull.split('@')[0].split(':')[0];
        const pLid = (p.lid || '').split('@')[0].split(':')[0];
        if (pLid === raw && /^\d{7,15}$/.test(pid)) { cacheLidPhone(raw, pid); return pid; }
      }
    }
  } catch {}

  return 'Member';
};

// Resolve display name: store contacts → LID resolution layers
async function _resolveName(sock, participantJid, groupParticipants = null) {
  if (!participantJid) return 'Member';

  // 1. Try push name from lightweight contact store
  try {
    const c = store.contacts?.[participantJid];
    if (c?.name) return c.name;
    if (c?.notify) return c.notify;
  } catch {}

  const raw = participantJid.split('@')[0].split(':')[0];

  // 2. Not a LID — raw IS the phone
  if (!isLidJid(participantJid)) {
    return /^\d{7,15}$/.test(raw) ? raw : 'Member';
  }

  // 3. Fast in-memory LID cache
  const fast = resolvePhoneFromLid(participantJid, sock);
  if (fast && /^\d{7,15}$/.test(fast) && fast !== raw) return fast;

  // 4. Scan group participants for LID→phone match
  if (groupParticipants) {
    for (const p of groupParticipants) {
      const pid  = (p.id  || '').split('@')[0].split(':')[0];
      const pLid = (p.lid || '').split('@')[0].split(':')[0];
      if ((pLid === raw || pid === raw) && pid && !pid.includes('lid') && /^\d{7,15}$/.test(pid)) {
        cacheLidPhone(raw, pid);
        try {
          const resolved = pid + '@s.whatsapp.net';
          const c = store.contacts?.[resolved];
          if (c?.name) return c.name;
          if (c?.notify) return c.notify;
        } catch {}
        return pid;
      }
    }
  }

  // 5. Async group-scan fallback
  const fromGroup = await resolveSenderFromGroup(participantJid, null, sock).catch(() => null);
  if (fromGroup && /^\d{7,15}$/.test(fromGroup)) return fromGroup;

  return 'Member';
}

function _getNow() {
  const tz = getCurrentTimezone() || 'Africa/Nairobi';
  const now = new Date();
  const time = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleString('en-GB', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' });
  return { time, date };
}

function _randomGoodbye(displayNum, groupName, memberCount, botName, time, date) {
const year = new Date().getFullYear();
const templates = [
`@${displayNum} Has run out of data, let's pray for the poor \n\nAnyway Goodbye Hustler \n\n *Members left:* ${memberCount}\n *Date:* ${date}\n *Time:* ${time}\n\n *${botName}* ${year}.`,
`@${displayNum} escaped!\n\nThey couldn't handle the vibes here.\n\nRemaining members: ${memberCount}\n\n *${botName}* ${year}.`,
`@${displayNum} went to buy data.\n\nWe hope you come back with full 5G!\n\nFrom: *${groupName}*\n\n *${botName}* ${year}.`,
`@${displayNum} got tired of our nonsense \n\nGoodbye, we'll miss your reactions! \n\n *${botName}* ${year}.`,
`@${displayNum} left the chat...\n\nProbably to touch some grass \n\nCome back soon!\n\n *${botName}* ${year}.`,
`@${displayNum} said "I'll be back" like Arnold \n\nWe're waiting... ⏳\n\n *${botName}* ${year}.`,
`@${displayNum} has left the group.\n\nReason: Group too lit \n\nMembers now: ${memberCount}\n\n *${botName}* ${year}.`,
`@${displayNum} ran away \n\nGoodbye and good luck out there! \n\n *${botName}* ${year}.`,
`@${displayNum} went to find cheaper data bundles \n\nGoodbye hustler! \n\n *${botName}* ${year}.`,
`@${displayNum} couldn't handle the admin's jokes \n\nWe don't blame you. Bye! \n\n *${botName}* ${year}.`,
];
return templates[Math.floor(Math.random() * templates.length)];
}

// Deduplication guard — prevents double welcome if event fires twice
const _recentlyWelcomed = new Map();

const handleWelcome = async (sock, chatId, participants, action) => {
  try {
    const { isWelcomeEnabled, getWelcome, isGoodbyeEnabled, getGoodbye } = require('./database');
    const botName = getBotName();
    const year = new Date().getFullYear();
    const { time, date } = _getNow();

    let groupMeta;
    try { groupMeta = await sock.groupMetadata(chatId); } catch {}
    const groupName   = groupMeta?.subject || 'the group';
    const groupDesc   = (groupMeta?.desc || '').trim();
    const memberCount = groupMeta?.participants?.length || 0;
    const groupParts  = groupMeta?.participants || [];

    // Fetch group profile picture once as fallback avatar
    let ppgroup;
    try { ppgroup = await sock.profilePictureUrl(chatId, 'image'); } catch {}
    if (!ppgroup) ppgroup = 'https://i.ibb.co/Z2Fyf4t/default-avatar.png';

    // Clean dedup cache (TTL 60s)
    const now = Date.now();
    for (const [k, ts] of _recentlyWelcomed.entries()) {
      if (now - ts > 60000) _recentlyWelcomed.delete(k);
    }

    for (const participant of participants) {
      const participantJid = typeof participant === 'string'
        ? participant
        : (participant?.id || participant?.jid || String(participant));

      if (action === 'add') {
        if (!isWelcomeEnabled(chatId)) continue;

        const dedupKey = `${chatId}:${participantJid}`;
        if (_recentlyWelcomed.has(dedupKey)) continue;
        _recentlyWelcomed.set(dedupKey, Date.now());

        try {
          const displayName = await _resolveName(sock, participantJid, groupParts);
          const rawPart = participantJid.split('@')[0].split(':')[0];
          const isLidPart = participantJid.endsWith('@lid');
          let mentionNum, mentionJid;
          if (!isLidPart && /^\d{7,15}$/.test(rawPart)) {
            // Direct phone JID — rawPart is the real phone number
            mentionNum = rawPart; mentionJid = participantJid;
          } else if (/^\d{7,15}$/.test(displayName) && displayName !== rawPart) {
            // LID resolved to a real phone number
            mentionNum = displayName; mentionJid = `${displayName}@s.whatsapp.net`;
          } else {
            // Unresolved LID — use rawPart as display, original JID for mention
            mentionNum = rawPart; mentionJid = participantJid;
          }

          // Fetch user's profile picture; fall back through JIDs then group pic
          let avatarUrl;
          try { avatarUrl = await sock.profilePictureUrl(mentionJid, 'image'); } catch {}
          if (!avatarUrl) {
            try {
              if (mentionJid !== participantJid)
                avatarUrl = await sock.profilePictureUrl(participantJid, 'image');
            } catch {}
          }
          if (!avatarUrl) avatarUrl = ppgroup;

          const rawMsg = getWelcome(chatId)?.message;
          const _staleDefaults = ['welcome @user to the group', 'welcome to the group'];
          const isStale = rawMsg && _staleDefaults.some(s => rawMsg.toLowerCase().includes(s));
          const customMsg = (rawMsg && rawMsg.trim() && !isStale) ? rawMsg : null;

          let welcomeText;
          if (customMsg) {
            welcomeText = customMsg
              .replace(/@\{user\}/g, `@${mentionNum}`)
              .replace(/\{user\}/g, `@${mentionNum}`)
              .replace(/@user/g, `@${mentionNum}`)
              .replace(/\{group\}/g, groupName)
              .replace(/\{description\}/g, groupDesc)
              .replace(/\{time\}/g, time)
              .replace(/\{bot\}/g, botName)
              .replace(/\{members\}/g, String(memberCount));
          } else {
            welcomeText = `@${mentionNum} Welcome,\n\nWelcome to *${groupName}*.\n\n*Members:* ${memberCount}\n*Date:* ${date}\n*Time:* ${time}\n\nYou might want to read the group description,\nFollow group rules to avoid being removed.\n\n *${botName}* ${year}.`;
          }

          await sock.sendMessage(chatId, {
            image: { url: avatarUrl },
            caption: welcomeText,
            mentions: [mentionJid],
            ...getChannelInfo(),
          });

        } catch (err) {
          await sock.sendMessage(chatId, {
            text: `@${participantJid.split('@')[0].split(':')[0]} Welcome,\n\nWelcome to *${groupName}*.\n\nFollow group rules to avoid being removed.\n\n *${botName}* ${year}.`,
            mentions: [participantJid],
          }).catch(() => {});
        }

      } else if (action === 'remove') {
        if (!isGoodbyeEnabled(chatId)) continue;

        try {
          const displayName = await _resolveName(sock, participantJid, groupParts);
          const rawPart = participantJid.split('@')[0].split(':')[0];
          const isLidPart = participantJid.endsWith('@lid');
          let mentionNum, mentionJid;
          if (!isLidPart && /^\d{7,15}$/.test(rawPart)) {
            // Direct phone JID — rawPart is the real phone number
            mentionNum = rawPart; mentionJid = participantJid;
          } else if (/^\d{7,15}$/.test(displayName) && displayName !== rawPart) {
            // LID resolved to a real phone number
            mentionNum = displayName; mentionJid = `${displayName}@s.whatsapp.net`;
          } else {
            // Unresolved LID — use rawPart as display, original JID for mention
            mentionNum = rawPart; mentionJid = participantJid;
          }

          // Fetch user's profile picture; fall back through JIDs then group pic
          let avatarUrl;
          try { avatarUrl = await sock.profilePictureUrl(mentionJid, 'image'); } catch {}
          if (!avatarUrl) {
            try {
              if (mentionJid !== participantJid)
                avatarUrl = await sock.profilePictureUrl(participantJid, 'image');
            } catch {}
          }
          if (!avatarUrl) avatarUrl = ppgroup;

          const customMsg = getGoodbye(chatId);
          let goodbyeText;
          if (customMsg && customMsg.trim()) {
            goodbyeText = customMsg
              .replace(/@\{user\}/g, `@${mentionNum}`)
              .replace(/\{user\}/g, `@${mentionNum}`)
              .replace(/@user/g, `@${mentionNum}`)
              .replace(/\{group\}/g, groupName)
              .replace(/\{time\}/g, time)
              .replace(/\{bot\}/g, botName)
              .replace(/\{members\}/g, String(memberCount));
          } else {
            goodbyeText = _randomGoodbye(mentionNum, groupName, memberCount, botName, time, date);
          }

          await sock.sendMessage(chatId, {
            image: { url: avatarUrl },
            caption: goodbyeText,
            mentions: [mentionJid],
            ...getChannelInfo(),
          });

        } catch (err) {
          const rawNum = participantJid.split('@')[0].split(':')[0];
          const fallbacks = [
            `@${rawNum} ran out of data.\n\nGoodbye!`,
            `@${rawNum} left the chat.`,
            `@${rawNum} escaped! Goodbye!`,
          ];
          await sock.sendMessage(chatId, {
            text: fallbacks[Math.floor(Math.random() * fallbacks.length)],
            mentions: [participantJid],
          }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error('Welcome/Goodbye error:', error.message);
  }
};

// ============================
// AUTOREACT HANDLER
// ============================
const handleAutoReact = async (sock, message, context) => {
  try {
    const mode = getSetting('autoreact', 'off');
    if (mode === 'off') return;
    const { chatId, isGroup, isFromOwner } = context;
    if (isFromOwner) return;
    if (mode === 'dm' && isGroup) return;
    if (mode === 'group' && !isGroup) return;

    const emojis = getSetting('reactionEmojis', ['✅', '❤', '👍', '🔥', '💯', '🌟']);
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } });
  } catch (error) {}
};

// ============================
// ALWAYSONLINE HANDLER
// ============================
const handleAlwaysOnline = async (sock) => {
  try {
    const enabled = getSetting('alwaysonline', false);
    if (enabled) {
      await sock.sendPresenceUpdate('available');
    }
  } catch (error) {}
};

// ============================
// AUTOREAD HANDLER
// ============================
const handleAutoRead = async (sock, message, context) => {
  try {
    const raw = getSetting('autoread', false);
    const enabled = raw === true || raw === 'true' || raw === 1 || raw === '1';
    if (!enabled) return;
    const { chatId } = context;
    await sock.readMessages([message.key]);
  } catch (error) {}
};

// ============================
// CHATBOT HANDLER
// Global mode: getSetting('chatbot', 'off') → 'off'|'dm'|'group'|'both'
// Per-group override: getChatData(chatId, 'chatbot', false) → true/false
// Group: only reply when bot is @mentioned or someone replies to bot's msg.
// DM:    reply to all texts.
// Owner's own messages are always skipped.
// ============================
// Track IDs of messages the chatbot itself sent — prevents infinite reply loops
const _chatbotSentIds = new Set();

const handleChatbot = async (sock, message, context) => {
  try {
    const { chatId, isGroup, isPrivate, isFromOwner, senderId, isBotMentioned } = context;

    // Skip if this is a message the chatbot itself sent (loop prevention)
    if (message.key?.fromMe && _chatbotSentIds.has(message.key?.id)) return;

    const globalMode = String(getSetting('chatbot', 'off')).toLowerCase();

    if (globalMode === 'off') return;
    if (globalMode === 'dm' && isGroup) return;
    if (globalMode === 'group' && !isGroup) return;

    // In groups: check mention/reply-to-bot first (Dave X pattern — checks phone AND LID)
    if (isGroup) {
      const quotedCtx  = message.message?.extendedTextMessage?.contextInfo;
      const botNum     = (sock.user?.id  || '').split('@')[0].split(':')[0];
      const botLidNum  = (sock.user?.lid || '').split('@')[0].split(':')[0];

      // Re-check isBotMentioned using raw contextInfo (covers LID-based mentions)
      const mentionedJids = quotedCtx?.mentionedJid || [];
      const isMentioned = isBotMentioned || mentionedJids.some(jid => {
        const n = jid.split('@')[0].split(':')[0];
        return n === botNum || (botLidNum && n === botLidNum);
      });

      const quotedParticipant = quotedCtx?.participant || '';
      const quotedNum         = quotedParticipant.split('@')[0].split(':')[0];
      let isBotReplied = false;
      if (quotedParticipant) {
        if (quotedNum === botNum || (botLidNum && quotedNum === botLidNum)) {
          isBotReplied = true;
        } else if (quotedParticipant.endsWith('@lid')) {
          const phone = global.lidCache?.get(quotedNum);
          if (phone && phone === botNum) isBotReplied = true;
        }
        if (!isBotReplied && quotedCtx?.quotedMessage) {
          const qMsg = quotedCtx.quotedMessage;
          const isFromBotCtx = qMsg?.messageContextInfo?.sourceContext === 'fromMe' ||
                               quotedParticipant === (sock.user?.id || '');
          if (isFromBotCtx) isBotReplied = true;
        }
      }

      // In groups: only respond when bot is directly mentioned or someone replied to the bot
      if (!isMentioned && !isBotReplied) return;
    }

    const rawText = context.rawText;
    if (!rawText || rawText.trim().length < 1) return;

    const prefix = String(getSetting('prefix', '.')).trim() || '.';
    if (rawText.startsWith(prefix)) return;

    const cleanText = rawText.replace(/@\d+/g, '').trim();
    if (!cleanText) return;

    await sock.presenceSubscribe(chatId).catch(() => {});
    await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

    const chatbot = require('../Adevoslib/chatbot');
    const response = await chatbot.getReply(cleanText);

    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    if (!response) return;

    const sent = await sock.sendMessage(chatId, { text: response }, { quoted: message });
    if (sent?.key?.id) {
      _chatbotSentIds.add(sent.key.id);
      setTimeout(() => _chatbotSentIds.delete(sent.key.id), 30000);
    }
  } catch (error) {
    console.error('[Chatbot] error:', error.message);
  }
};

// ============================
// ANTIBADWORD HANDLER
// ============================
const DEFAULT_BAD_WORDS = [
  'fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard', 'dick', 'cock',
  'pussy', 'slut', 'whore', 'cunt', 'nigga', 'motherfucker', 'prick',
  'wanker', 'gandu', 'madarchod', 'bhosdike', 'bsdk', 'fucker', 'bhosda',
  'lauda', 'laude', 'betichod', 'chutiya', 'behenchod', 'randi', 'idiot',
  'chut', 'harami', 'kameena', 'haramzada',
];

const handleAntibadword = async (sock, message, context) => {
  try {
    const { chatId, isGroup, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
    if (!isGroup) return;

    const cfg = getChatData(chatId, 'antibadword', { enabled: false, action: 'delete', maxWarnings: 3, words: [] });
    if (!cfg.enabled) return;
    if (isSenderAdmin || senderIsSudo) return;
    if (!isBotAdmin) return;

    const msg = message.message;
    const text = (
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      msg?.documentMessage?.caption || ''
    ).toLowerCase();

    if (!text) return;

    const allWords = [...new Set([...DEFAULT_BAD_WORDS, ...(cfg.words || [])])];
    const found = allWords.find(w => text.includes(w.toLowerCase()));
    if (!found) return;

    const sender = message.key.participant || message.key.remoteJid;
    const senderNum = (sender || '').split('@')[0];
    const botName = getBotName();
    const fake = createFakeContact(sender);
    const action = cfg.action || 'delete';

    await sock.sendMessage(chatId, { delete: message.key }).catch(() => {});

    if (action === 'kick') {
      await sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {});
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antibadword', fields: [['Kicked', `@${senderNum}`], ['Reason', 'Bad word used']] }),
        mentions: [sender]
      }, { quoted: fake });
    } else if (action === 'warn') {
      const warnKey = 'bwarn_' + sender.split('@')[0];
      const count = (getChatData(chatId, warnKey, 0) || 0) + 1;
      const max = cfg.maxWarnings || 3;
      updateChatData(chatId, warnKey, count);

      if (count >= max) {
        updateChatData(chatId, warnKey, 0);
        await sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {});
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antibadword', fields: [['Kicked', `@${senderNum}`], ['Reason', `Max warnings (${max}) reached`]] }),
          mentions: [sender]
        }, { quoted: fake });
      } else {
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Antibadword', fields: [['Warned', `@${senderNum}`], ['Warnings', `${count}/${max}`], ['Reason', 'Bad word used']] }),
          mentions: [sender]
        }, { quoted: fake });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antibadword', fields: [['Deleted', `@${senderNum}'s message`], ['Reason', 'Bad word used']] }),
        mentions: [sender]
      }, { quoted: fake });
    }
  } catch (err) {
    console.error('AntiBadword error:', err.message);
  }
};

// ============================
// ANTIDEMOTE HANDLER
// ============================
function _adNormalizeJid(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0] + '@s.whatsapp.net';
}
// Shared resolver: LID → real phone number string (digits only)
async function _resolveJidToPhone(sock, jid) {
  if (!jid) return 'unknown';
  const raw = jid.split('@')[0].split(':')[0];
  if (/^\d{7,15}$/.test(raw) && !jid.endsWith('@lid')) return raw;
  try { const r = resolvePhoneFromLid(jid, sock); if (r && /^\d{7,15}$/.test(r) && r !== raw) return r; } catch {}
  try {
    const { globalLidMapping } = require('@whiskeysockets/baileys/lib/Utils');
    for (const fmt of [jid, `${raw}@lid`, `${raw}:0@lid`]) {
      const pn = globalLidMapping?.getPnFromLid?.(fmt);
      if (pn) { const n = String(pn).split('@')[0].replace(/[^0-9]/g, ''); if (n.length >= 7 && n.length <= 15 && n !== raw) return n; }
    }
  } catch {}
  try {
    if (sock?.signalRepository?.lidMapping?.getPNForLID) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
      if (pn) { const n = String(pn).split('@')[0].replace(/[^0-9]/g, ''); if (n.length >= 7 && n.length <= 15 && n !== raw) return n; }
    }
  } catch {}
  return raw;
}
// Build real phone JID for WhatsApp mentions: resolves LID → phone@s.whatsapp.net
async function _buildPhoneJid(sock, jid) {
  const phone = await _resolveJidToPhone(sock, jid);
  if (/^\d{7,15}$/.test(phone)) return `${phone}@s.whatsapp.net`;
  return _adNormalizeJid(jid); // best-effort fallback
}
const _adResolveToPhone = _resolveJidToPhone;
function _adIncrWarn(chatId, author) {
  const key = `__adwarn__${author.split('@')[0].split(':')[0]}`;
  const count = ((getChatData(chatId, key, 0) || 0)) + 1;
  updateChatData(chatId, key, count); return count;
}
function _adResetWarn(chatId, author) { updateChatData(chatId, `__adwarn__${author.split('@')[0].split(':')[0]}`, 0); }

const handleAntidemote = async (sock, update) => {
  try {
    if (update.action !== 'demote') return;
    const chatId = update.id;
    const config = getChatData(chatId, 'antidemote', null);
    if (!config?.enabled) return;
    const author = typeof update.author === 'string' ? update.author : (update.author?.id || update.author?.jid || '');
    const participants = (update.participants || []).map(p => typeof p === 'string' ? p : (p?.id || p?.jid || p?.lid || '')).filter(Boolean);
    if (!author || !participants.length) return;
    const botName = getBotName();
    const botJid = _adNormalizeJid(sock.user?.id);
    const botNum = sock.user?.id?.split(':')[0]?.split('@')[0];
    const botLidNum = sock.user?.lid?.split(':')[0]?.split('@')[0];
    const authorNum = author?.split('@')[0]?.split(':')[0];
    if (authorNum === botNum || (botLidNum && authorNum === botLidNum)) return;
    let meta; try { meta = await sock.groupMetadata(chatId); } catch { return; }
    const ownerJid = _adNormalizeJid(meta.owner);
    const normalizedAuthor = _adNormalizeJid(author);
    if (normalizedAuthor === ownerJid) return;
    if (isSudo(author) || isSudo(normalizedAuthor)) return;
    const mode = config.mode || 'revert';
    const isBotDemoted = participants.some(p => {
      const norm = _adNormalizeJid(p); if (norm === botJid) return true;
      const pNum = p.split('@')[0].split(':')[0];
      return pNum === botNum || (botLidNum && pNum === botLidNum);
    });
    if (isBotDemoted) {
      const authorNumber = await _resolveJidToPhone(sock, author);
      const authorMJid   = await _buildPhoneJid(sock, author);
      const ownerContact = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      try { await sock.sendMessage(ownerContact, { text: buildFrame({ title: 'Bot Demoted', fields: [['Group', meta.subject || chatId], ['By', `@${authorNumber}`], ['Action needed', 'Re-promote me']] }), mentions: [authorMJid] }); } catch {}
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antidemote', fields: [['Bot demoted by', `@${authorNumber}`], ['Status', 'Owner notified']] }), mentions: [authorMJid], ...getChannelInfo() });
      return;
    }
    const adminStatus = await isAdmin(sock, chatId, author);
    if (!adminStatus.isBotAdmin) return;
    const authorNumber = await _resolveJidToPhone(sock, author);
    const targetNumber = await _resolveJidToPhone(sock, participants[0]);
    const authorMJid   = await _buildPhoneJid(sock, author);
    const partMJids    = await Promise.all(participants.map(p => _buildPhoneJid(sock, p)));
    // Notify mode takes no corrective action — just reports what happened.
    if (mode !== 'notify') {
      await sock.groupParticipantsUpdate(chatId, participants, 'promote').catch(e => console.log('[ANTIDEMOTE] promote:', e.message));
    }
    if (mode === 'notify') {
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antidemote', fields: [[`@${authorNumber}`, `Demoted @${targetNumber}`]] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
    } else if (mode === 'kick') {
      await sock.groupParticipantsUpdate(chatId, [author], 'remove').catch(() => {});
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antidemote', fields: [['Blocked', `@${authorNumber} tried to demote @${targetNumber}`], ['Action', 'Reverted and removed']] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
    } else if (mode === 'warn') {
      const max = config.maxWarnings || 3; const count = _adIncrWarn(chatId, author);
      if (count >= max) {
        await sock.groupParticipantsUpdate(chatId, [author], 'remove').catch(() => {}); _adResetWarn(chatId, author);
        await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antidemote', fields: [['Kicked', `@${authorNumber}`], ['Reason', `Max warnings (${max}) reached`]] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
      } else {
        await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antidemote', fields: [['Warned', `@${authorNumber}`], ['Warnings', `${count}/${max}`]] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
      }
    } else {
      await sock.groupParticipantsUpdate(chatId, [author], 'demote').catch(() => {});
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antidemote', fields: [['Blocked', `@${authorNumber} tried to demote @${targetNumber}`], ['Action', 'Demotion reversed']] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
    }
  } catch (err) { console.error('[Antidemote]', err.message); }
};

// ============================
// ANTIPROMOTE HANDLER
// ============================
const _apResolveToPhone = _resolveJidToPhone;
function _apIncrWarn(chatId, author) {
  const key = `__apwarn__${author.split('@')[0].split(':')[0]}`;
  const count = ((getChatData(chatId, key, 0) || 0)) + 1;
  updateChatData(chatId, key, count); return count;
}
function _apResetWarn(chatId, author) { updateChatData(chatId, `__apwarn__${author.split('@')[0].split(':')[0]}`, 0); }

const handleAntipromote = async (sock, update) => {
  try {
    if (update.action !== 'promote') return;
    const chatId = update.id;
    const config = getChatData(chatId, 'antipromote', null);
    if (!config?.enabled) return;
    const author = typeof update.author === 'string' ? update.author : (update.author?.id || update.author?.jid || '');
    const participants = (update.participants || []).map(p => typeof p === 'string' ? p : (p?.id || p?.jid || p?.lid || '')).filter(Boolean);
    if (!author || !participants.length) return;
    const botName = getBotName();
    const botJid = _adNormalizeJid(sock.user?.id);
    const botNum = sock.user?.id?.split(':')[0]?.split('@')[0];
    const botLidNum = sock.user?.lid?.split(':')[0]?.split('@')[0];
    const authorNum = author?.split('@')[0]?.split(':')[0];
    if (authorNum === botNum || (botLidNum && authorNum === botLidNum)) return;
    let meta; try { meta = await sock.groupMetadata(chatId); } catch { return; }
    const ownerJid = _adNormalizeJid(meta.owner);
    const normalizedAuthor = _adNormalizeJid(author);
    if (normalizedAuthor === ownerJid) return;
    if (isSudo(author) || isSudo(normalizedAuthor)) return;
    const botParticipant = meta.participants.find(p => {
      const norm = _adNormalizeJid(p.id); if (norm === botJid) return true;
      const pNum = (p.id || '').split('@')[0].split(':')[0];
      return pNum === botNum || (botLidNum && pNum === botLidNum);
    });
    if (!botParticipant || (botParticipant.admin !== 'admin' && botParticipant.admin !== 'superadmin')) return;
    const mode = config.mode || 'revert';
    const authorNumber = await _resolveJidToPhone(sock, author);
    const targetNumber = await _resolveJidToPhone(sock, participants[0]);
    const authorMJid   = await _buildPhoneJid(sock, author);
    const partMJids    = await Promise.all(participants.map(p => _buildPhoneJid(sock, p)));
    // Use raw participants from event (same as antidemote) — converted JIDs fail for unresolved LIDs
    // Notify mode takes no corrective action — just reports what happened.
    if (mode !== 'notify') {
      await sock.groupParticipantsUpdate(chatId, participants, 'demote').catch(e => console.log('[ANTIPROMOTE] demote:', e.message));
    }
    if (mode === 'notify') {
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antipromote', fields: [[`@${authorNumber}`, `Promoted @${targetNumber}`]] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
    } else if (mode === 'kick') {
      try { await sock.groupParticipantsUpdate(chatId, [author], 'remove'); } catch {}
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antipromote', fields: [['Blocked', `@${authorNumber} promoted @${targetNumber}`], ['Action', 'Reverted and removed']] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
    } else if (mode === 'warn') {
      const max = config.maxWarnings || 3; const count = _apIncrWarn(chatId, author);
      if (count >= max) {
        try { await sock.groupParticipantsUpdate(chatId, [author], 'remove'); } catch {}
        _apResetWarn(chatId, author);
        await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antipromote', fields: [['Kicked', `@${authorNumber}`], ['Reason', `Max warnings (${max}) reached`]] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
      } else {
        await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antipromote', fields: [['Blocked', `@${authorNumber} promoted @${targetNumber}`], ['Warnings', `${count}/${max}`]] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
      }
    } else {
      await sock.sendMessage(chatId, { text: buildFrame({ title: 'Antipromote', fields: [['Blocked', `@${authorNumber} promoted @${targetNumber}`], ['Action', 'Promotion reversed']] }), mentions: [authorMJid, ...partMJids], ...getChannelInfo() });
    }
  } catch (err) { console.error('[Antipromote]', err.message); }
};

// ============================
// AUTOSTATUS HANDLER
// ============================
const _AS_EMOJIS = ['❤️', '💛', '👍', '💜', '😮', '🤍', '💙'];
const _asReactCooldown = new Map();
const _AS_COOLDOWN_MS = 30000;
function _asRandomEmoji() { return _AS_EMOJIS[Math.floor(Math.random() * _AS_EMOJIS.length)]; }
function _asReadConfig() {
  try {
    const raw = getSetting('autostatusConfig', null);
    const DEF = { viewOn: true, reactOn: false, replyOn: false, replyText: '👀 Seen your status!', reactionEmoji: '❤️', randomReactions: true };
    if (raw && typeof raw === 'object') return { ...DEF, ...raw };
    return { viewOn: getSetting('autoviewstatus', true), reactOn: getSetting('autostatusreact', false), replyOn: getSetting('autostatusreply', false), replyText: getSetting('autostatusreplytext', DEF.replyText), reactionEmoji: getSetting('autostatusemoji', '❤️'), randomReactions: getSetting('autostatusrandom', true) };
  } catch { return { viewOn: true, reactOn: false, replyOn: false, replyText: '👀 Seen your status!', reactionEmoji: '❤️', randomReactions: true }; }
}
function _asCanReact(phoneNum) {
  const num = (phoneNum || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!num) return false;
  const last = _asReactCooldown.get(num) || 0;
  if (Date.now() - last < _AS_COOLDOWN_MS) return false;
  _asReactCooldown.set(num, Date.now());
  if (_asReactCooldown.size > 500) { const c = Date.now() - _AS_COOLDOWN_MS; for (const [k, v] of _asReactCooldown) if (v < c) _asReactCooldown.delete(k); }
  return true;
}
function _asIsLid(jid) { return typeof jid === 'string' && jid.endsWith('@lid'); }
async function _asResolveLid(lid, mek, sock) {
  const lidNum = (lid || '').split('@')[0].split(':')[0];
  try { const pn = mek?.key?.participantPn || mek?.key?.senderPn; if (pn) { const n = String(pn).split('@')[0].replace(/[^0-9]/g, ''); if (/^\d{7,15}$/.test(n) && n !== lidNum) return `${n}@s.whatsapp.net`; } } catch {}
  try { const phone = resolvePhoneFromLid(lid, sock); if (phone) return `${phone}@s.whatsapp.net`; } catch {}
  try {
    if (sock?.signalRepository?.lidMapping) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(lid);
      if (pn) { const n = String(pn).split('@')[0].replace(/[^0-9]/g, ''); if (/^\d{7,15}$/.test(n) && n !== lidNum) return `${n}@s.whatsapp.net`; }
    }
  } catch {}
  return null;
}
// Dedup set for status replies — keyed by message ID to prevent duplicate fires
// when the same status update fires multiple upsert events (notify + append + sync)
const _asRepliedIds = new Set();
const handleStatusUpdate = async (sock, statusUpdate) => {
  try {
    let mek = statusUpdate?.messages?.[0]; if (!mek) return;
    if (mek.message && Object.keys(mek.message)[0] === 'ephemeralMessage') mek.message = mek.message.ephemeralMessage.message;
    if (mek.key?.remoteJid !== 'status@broadcast') return;
    if (mek.key.fromMe) return;
    const cfg = _asReadConfig();
    const rawJid = mek.key.participant || '';
    if (!rawJid || !rawJid.includes('@')) return;
    let phoneJid = _asIsLid(rawJid) ? (await _asResolveLid(rawJid, mek, sock)) : rawJid;
    if (cfg.viewOn) {
      try { await sock.readMessages([phoneJid && !_asIsLid(phoneJid) ? { ...mek.key, participant: phoneJid } : mek.key]); } catch (e) { console.error('[AutoStatus] view:', e.message); }
    }
    if (cfg.reactOn && phoneJid && !_asIsLid(phoneJid) && _asCanReact(phoneJid)) {
      try {
        await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 3000)));
        const emoji = cfg.randomReactions ? _asRandomEmoji() : cfg.reactionEmoji;
        await sock.sendMessage('status@broadcast', { react: { text: emoji, key: { ...mek.key, participant: phoneJid } } }, { statusJidList: [phoneJid] });
      } catch (e) { console.error('[AutoStatus] react:', e.message); }
    }
    if (cfg.replyOn && phoneJid && !_asIsLid(phoneJid)) {
      // Deduplicate: same status ID must not get replied to more than once
      const msgId = mek.key?.id || '';
      if (msgId && _asRepliedIds.has(msgId)) return;
      if (msgId) {
        _asRepliedIds.add(msgId);
        setTimeout(() => _asRepliedIds.delete(msgId), 5 * 60 * 1000);
      }
      try { await sock.sendMessage(phoneJid, { text: cfg.replyText || '👀 Seen your status!' }, { quoted: mek }); } catch (e) { console.error('[AutoStatus] reply:', e.message); }
    }
  } catch (err) { console.error('[AutoStatus]', err.message); }
};

// ============================
// AUTORECORDING / AUTOTYPING HANDLERS
// ============================
// Keep one interval registry per feature. The owner commands stop the registries
// exported by these helpers, so toggling a global feature off takes effect.
const handleAutorecordingForMessage = async (sock, chatId) => {
  const { handleAutorecordingForMessage: run } = require('../Adevoslib/autorecording');
  return run(sock, chatId);
};

const handleAutotypingForMessage = async (sock, chatId) => {
  const { handleAutotypingForMessage: run } = require('../Adevoslib/autotyping');
  return run(sock, chatId);
};

// ============================
// NEWSLETTER REACT HANDLER
// ============================
const _nlReactedIds = new Set();
const handleNewsletterMessage = async (sock, message) => {
  try {
    const { readConfig: _nlCfg, loadChannels: _nlChannels, randomEmoji: _nlEmoji } = require('../Adevoslib/newsletterReact');
    const cfg = _nlCfg();
    if (!cfg.enabled) return;
    const remoteJid = message.key?.remoteJid;
    if (!remoteJid?.endsWith('@newsletter')) return;
    const channels = _nlChannels();
    if (!channels.includes(remoteJid)) return;
    const serverId = message.key?.server_id;
    if (!serverId) return;
    const reactKey = `${remoteJid}:${serverId}`;
    if (_nlReactedIds.has(reactKey)) return;
    _nlReactedIds.add(reactKey);
    if (_nlReactedIds.size > 200) _nlReactedIds.clear();
    await sock.newsletterReactMessage(remoteJid, String(serverId), _nlEmoji());
  } catch {}
};

module.exports = {
  handleAntilink,
  handleAutoEmoji,
  handleWelcome,
  handleAutoReact,
  handleAlwaysOnline,
  handleAutoRead,
  handleChatbot,
  handleAntibadword,
  handleAntidemote,
  handleAntipromote,
  handleStatusUpdate,
  handleAutorecordingForMessage,
  handleAutotypingForMessage,
  handleNewsletterMessage,
};
