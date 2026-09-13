const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSudo, updateCommandData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'sudolist',
    aliases: ['sudos', 'listsudo'],
    category: 'owner',
    description: 'List all sudo users',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const list = getSudo();
      if (!list.length) return sock.sendMessage(chatId, { text: buildHint('No sudo users added') }, { quoted: fake });

      const mentions = list.map(n => `${n}@s.whatsapp.net`);
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Sudo Users', fields: list.map((n, i) => [String(i + 1), `+${n}`]) }),
        mentions,
      }, { quoted: fake, ...replyOpts() });
    }
  },
  {
    name: 'sudoreset',
    category: 'owner',
    description: 'Clear all sudo users',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      updateCommandData('sudo', 'list', []);
      return sock.sendMessage(chatId, { text: buildHint('Sudo list reset — all sudo users removed') }, { quoted: fake, ...replyOpts() });
    }
  }
];
