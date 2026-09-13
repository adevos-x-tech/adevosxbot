const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
  {
    name: 'promote',
    aliases: ['admin'],
    category: 'group',
    description: 'Promote a member to admin — mention, number, or reply',
    usage: '.promote @user | .promote 255... | reply .promote',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or give a number to promote') }, { quoted: fake });

      try {
        await sock.groupParticipantsUpdate(chatId, targets, 'promote');
        const tags = targets.map(t => `@${t.split('@')[0]}`).join(', ');
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Promoted', fields: [['To admin', tags]] }),
          mentions: targets,
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Promote failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
