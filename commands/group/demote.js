const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
  {
    name: 'demote',
    category: 'group',
    description: 'Demote an admin — mention, number, or reply',
    usage: '.demote @user | .demote 255... | reply .demote',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or give a number to demote') }, { quoted: fake });

      try {
        await sock.groupParticipantsUpdate(chatId, targets, 'demote');
        const tags = targets.map(t => `@${t.split('@')[0]}`).join(', ');
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Demoted', fields: [['From admin', tags]] }),
          mentions: targets,
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Demote failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
