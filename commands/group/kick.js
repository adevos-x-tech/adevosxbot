const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'kick',
    aliases: ['remove'],
    category: 'group',
    description: 'Kick a member from the group — mention, number, or reply',
    usage: '.kick @user | .kick 255... | reply .kick',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin to kick!']] }) }, { quoted: fake });
      }
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const { targets } = resolveTargets(message, args);
      if (!targets.length) {
        return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or give a number to kick') }, { quoted: fake });
      }

      try {
        await sock.groupParticipantsUpdate(chatId, targets, 'remove');
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Kicked', fields: [['Member(s)', targets.map(t => `@${t.split('@')[0]}`).join(', ')]] }),
          mentions: targets
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Kick failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
