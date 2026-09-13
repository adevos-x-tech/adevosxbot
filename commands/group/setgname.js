const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const isAdmin = require('../../AdevosAuth/isAdmin');

module.exports = [
  {
    name: 'setgname',
    aliases: ['setname', 'groupname'],
    category: 'group',
    description: 'Set the group name — type it, or reply to a message to use its text',
    usage: '.setgname <name> | reply to a message with .setgname | .setgname <id> <name>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const inGroup = chatId.endsWith('@g.us');

      let rest = [...args];
      let targetId = inGroup ? chatId : null;
      if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) targetId = rest.shift();

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .setgname <group-id> <name>', 'Or run it inside a group') }, { quoted: fake });
      }

      const perms = targetId === chatId ? { isSenderAdmin, isBotAdmin } : await isAdmin(sock, targetId, senderId).catch(() => ({}));
      if (!perms.isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      if (!perms.isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });

      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
      const name = (quotedText || rest.join(' ')).trim();

      if (!name) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .setgname <name>', 'Or reply to a message with .setgname') }, { quoted: fake });
      }

      try {
        await sock.groupUpdateSubject(targetId, name);
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Group Name Updated', fields: [['New name', name]] }) }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
