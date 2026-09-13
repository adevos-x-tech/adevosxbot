const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'blocklist',
    aliases: ['blocked'],
    category: 'owner',
    description: 'Show blocked contacts',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      try {
        const list = await sock.fetchBlocklist();
        if (!list || !list.length) return sock.sendMessage(chatId, { text: buildHint('No blocked contacts') }, { quoted: fake });

        const { resolvePhoneFromLid } = require('../../AdevosAuth/lidResolver');
        const resolved = list.map((j) => {
          const raw = j.split('@')[0].split(':')[0];
          if (raw.length > 13) {
            const phone = resolvePhoneFromLid(`${raw}@lid`, sock);
            if (phone && phone !== raw) return `+${phone}`;
          }
          return `+${raw}`;
        });

        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Blocked Contacts', fields: resolved.map((num, i) => [String(i + 1), num]).concat([['Total', String(list.length)]]) })
        }, { quoted: fake, ...replyOpts() });
      } catch (err) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
