const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const isAdmin = require('../../AdevosAuth/isAdmin');

module.exports = [
  {
    name: 'setgdesc',
    aliases: ['setdesc', 'groupdesc'],
    category: 'group',
    description: 'Set the group description — type it, or reply to a message to use its text',
    usage: '.setgdesc <text> | reply to a message with .setgdesc | .setgdesc <id> <text>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const inGroup = chatId.endsWith('@g.us');

      let rest = [...args];
      let targetId = inGroup ? chatId : null;
      if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) targetId = rest.shift();

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .setgdesc <group-id> <text>', 'Or run it inside a group') }, { quoted: fake });
      }

      const perms = targetId === chatId ? { isSenderAdmin, isBotAdmin } : await isAdmin(sock, targetId, senderId).catch(() => ({}));
      if (!perms.isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      if (!perms.isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });

      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
      const desc = (quotedText || rest.join(' ')).trim();

      if (!desc) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .setgdesc <text>', 'Or reply to a message with .setgdesc') }, { quoted: fake });
      }

      try {
        await sock.groupUpdateDescription(targetId, desc);
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Group Description Updated', fields: [['New description', desc]] }) }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
