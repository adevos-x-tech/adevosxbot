const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint } = require('../../Adevoslib/frame');

module.exports = [
{
  name: 'ping',
  aliases: ['p'],
  category: 'utility',
  description: 'Check bot speed',
  execute: async (sock, message, args, context) => {
    const { chatId } = context;
    const botName = getBotName();
    const fake = createFakeContact(message);
    try {
      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      const start = Date.now();
      const sentMsg = await sock.sendMessage(chatId, { text: `*${botName}* checking speed...` }, { quoted: fake });
      const ping = Date.now() - start;
      await sock.sendMessage(chatId, { text: `*${botName}* ${ping}ms`, edit: sentMsg.key });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (err) {
      await sock.sendMessage(chatId, { text: buildHint('Failed to measure speed') }, { quoted: fake });
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
  }
}
];
