const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'getgcpp',
    aliases: ['getgrouppp', 'ggcpp'],
    category: 'group',
    description: "Get a group's profile picture — works in-group or with an id",
    usage: '.getgcpp | .getgcpp <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : chatId.endsWith('@g.us') ? chatId : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .getgcpp <group-id>', 'Or run it inside a group') }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        let pfpUrl;
        try { pfpUrl = await sock.profilePictureUrl(targetId, 'image'); } catch { pfpUrl = 'https://files.catbox.moe/lvcwnf.jpg'; }
        await sock.sendMessage(chatId, { image: { url: pfpUrl }, caption: `Group picture — ${meta.subject}` }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
