'use strict';

// Cache groupMetadata per chatId with a 30-second TTL to avoid a live
// sock.groupMetadata() call on every single group message.
const _metaCache = new Map();
const _META_TTL  = 30_000;

async function getGroupMeta(sock, chatId) {
  const cached = _metaCache.get(chatId);
  if (cached && Date.now() - cached.ts < _META_TTL) return cached.data;
  const data = await sock.groupMetadata(chatId);
  _metaCache.set(chatId, { data, ts: Date.now() });
  return data;
}

async function isAdmin(sock, chatId, senderId) {
  try {
    const groupMetadata = await getGroupMeta(sock, chatId);
    const botId = sock.user.id;

    const ownerPhone = (global.ownerPhone || '').replace(/\D/g, '');
    const ownerLid   = (global.ownerLid   || '').replace(/\D/g, '');

    const findParticipant = (id) => {
      const idPhone = (id || '').split('@')[0].split(':')[0].split('.')[0];
      return groupMetadata.participants.find(p => {
        const pPhone = p.id.split('@')[0].split(':')[0].split('.')[0];
        if (pPhone === idPhone) return true;
        if (ownerPhone && ownerLid) {
          if (idPhone === ownerPhone && pPhone === ownerLid) return true;
          if (idPhone === ownerLid   && pPhone === ownerPhone) return true;
        }
        if (p.lid) {
          const pLid = String(p.lid).split('@')[0].split(':')[0].split('.')[0];
          if (pLid === idPhone) return true;
        }
        return false;
      });
    };

    const participant = findParticipant(senderId);
    const bot         = findParticipant(botId);

    return {
      isSenderAdmin: !!(participant && (participant.admin === 'admin' || participant.admin === 'superadmin')),
      isBotAdmin:    !!(bot         && (bot.admin         === 'admin' || bot.admin         === 'superadmin')),
    };
  } catch {
    return { isSenderAdmin: false, isBotAdmin: false };
  }
}

module.exports = isAdmin;
