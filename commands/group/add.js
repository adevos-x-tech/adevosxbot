const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'add',
    category: 'group',
    description: 'Add a member to the group',
    usage: '.add <number>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin to add!']] }) }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) {
        return sock.sendMessage(chatId, { text: buildHint('Provide a number to add', '.add 254712345678') }, { quoted: fake });
      }

      try {
        await sock.groupParticipantsUpdate(chatId, targets, 'add');
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Added', fields: [['Member(s)', targets.map(t => `@${t.split('@')[0]}`).join(', ')]] }),
          mentions: targets
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Add failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
