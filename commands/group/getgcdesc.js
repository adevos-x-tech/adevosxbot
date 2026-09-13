const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'getgcdesc',
    aliases: ['groupdescription', 'ggcdesc'],
    category: 'group',
    description: "Get a group's description — works in-group or with an id",
    usage: '.getgcdesc | .getgcdesc <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : chatId.endsWith('@g.us') ? chatId : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .getgcdesc <group-id>', 'Or run it inside a group') }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: meta.subject, fields: [['Description', meta.desc || '(none set)']] })
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
