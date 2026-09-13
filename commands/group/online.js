'use strict';

const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'online',
    aliases: ['onlinemembers', 'whosonline', 'listonline'],
    category: 'group',
    description: 'Check which group members are currently online (real presence, not activity-based)',
    usage: '.online',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { text: buildHint('Checking online members...', 'This takes a few seconds') }, { quoted: fake });

      try {
        const groupMeta = await sock.groupMetadata(chatId);
        const participants = groupMeta.participants;
        const presenceData = new Map();

        const presenceHandler = (update) => {
          if (update.presences) {
            for (const [jid, presence] of Object.entries(update.presences)) {
              presenceData.set(jid, presence);
              presenceData.set(jid.split('@')[0], presence);
            }
          }
        };
        sock.ev.on('presence.update', presenceHandler);

        try {
          const batchSize = 5;
          for (let i = 0; i < participants.length; i += batchSize) {
            const batch = participants.slice(i, i + batchSize);
            await Promise.all(batch.map(p => sock.presenceSubscribe(p.id).catch(() => {})));
            await new Promise(r => setTimeout(r, 500));
          }
          await new Promise(r => setTimeout(r, 2000));

          const onlineMembers = [];
          for (const p of participants) {
            const numOnly = p.id.split('@')[0];
            const presence = presenceData.get(p.id) || presenceData.get(numOnly);
            const status = presence?.lastKnownPresence;
            if (status === 'available' || status === 'composing' || status === 'recording') {
              const raw = p.id.split('@')[0].split(':')[0];
              const isLid = p.id.endsWith('@lid');
              let phone = raw;
              if (isLid) {
                const { resolvePhoneFromLid } = require('../../AdevosAuth/lidResolver');
                const resolved = resolvePhoneFromLid(p.id, sock);
                if (resolved && /^\d{7,15}$/.test(resolved) && resolved !== raw) phone = resolved;
              }
              onlineMembers.push({ jid: p.id, phone });
            }
          }

          sock.ev.off('presence.update', presenceHandler);

          if (onlineMembers.length === 0) {
            return sock.sendMessage(chatId, {
              text: buildHint('No members detected online', 'Only works for members with "online" visibility on')
            }, { quoted: fake });
          }

          const mentions = onlineMembers.map(m => m.jid);
          return sock.sendMessage(chatId, {
            text: buildFrame({
              title: 'Online Members',
              fields: [
                ['Count', `${onlineMembers.length} of ${participants.length}`],
                ...onlineMembers.map((m, i) => [String(i + 1), `@${m.phone}`]),
              ],
            }),
            mentions,
          }, { quoted: fake, ...replyOpts() });

        } catch (innerErr) {
          sock.ev.off('presence.update', presenceHandler);
          throw innerErr;
        }
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
