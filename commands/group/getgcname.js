const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'getgcname',
    aliases: ['groupname_get', 'ggcname'],
    category: 'group',
    description: "Get a group's name — works in-group or with an id",
    usage: '.getgcname | .getgcname <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : chatId.endsWith('@g.us') ? chatId : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .getgcname <group-id>', 'Or run it inside a group') }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Group Name', fields: [['Name', meta.subject], ['ID', targetId.split('@')[0]]] })
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
