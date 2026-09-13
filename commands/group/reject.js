const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'reject',
    aliases: ['rejectjoin', 'denyrequest'],
    category: 'group',
    description: 'Reject a pending group join request',
    usage: '.reject @user | .reject 255...',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }
      if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      }

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targets = mentions.length ? mentions : args.map(a => `${a.replace(/[^0-9]/g, '')}@s.whatsapp.net`).filter(a => a.length > 15);

      if (!targets.length) {
        return sock.sendMessage(chatId, { text: buildHint('Mention someone, or give a number, to reject') }, { quoted: fake });
      }

      try {
        await sock.groupRequestParticipantsUpdate(chatId, targets, 'reject');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Rejected', fields: [['Request(s)', targets.map(t => `@${t.split('@')[0]}`).join(', ')]] }),
          mentions: targets,
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
