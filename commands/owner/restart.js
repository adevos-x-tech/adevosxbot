const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'restart',
    category: 'owner',
    description: 'Restart the bot',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      await sock.sendMessage(chatId, { text: buildHint('Restarting...') }, { quoted: fake, ...replyOpts() });
      setTimeout(() => process.exit(0), 1000);
    }
  }
];
