const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getBannedList } = require('../../AdevosAuth/isBanned');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'banlist',
    aliases: ['banned', 'bans'],
    category: 'owner',
    description: 'Show all banned users',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const list = getBannedList ? getBannedList() : [];
      if (!list.length) return sock.sendMessage(chatId, { text: buildHint('No banned users') }, { quoted: fake });

      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Ban List', fields: list.map((n, i) => [String(i + 1), `+${String(n).replace(/\D/g, '')}`]) })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
