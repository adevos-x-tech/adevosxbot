const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'leave',
    aliases: ['left', 'leavegroup'],
    category: 'group',
    description: 'Make the bot leave the group (asks for confirmation)',
    usage: '.leave',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const sent = await sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Leave Group',
          fields: [['Are you sure?', `${botName} will leave this group`]],
          commands: ['1 — Yes, leave', '2 — Cancel'],
          footer: 'Reply with a number',
        })
      }, { quoted: fake, ...replyOpts() });

      if (!global.replyHandlers) global.replyHandlers = new Map();
      const handlerKey = sent?.key?.id;
      if (!handlerKey) return;

      global.replyHandlers.set(handlerKey, async (replyMsg) => {
        global.replyHandlers.delete(handlerKey);
        const replySender = replyMsg.key.participant || replyMsg.key.remoteJid;
        // NOTE: sender check intentionally removed — stanzaId match already
        // proves this is a genuine reply to this exact bot message; LID vs
        // phone-number JIDs for the same person cannot be reliably compared.
        const text = (replyMsg.message?.extendedTextMessage?.text || replyMsg.message?.conversation || '').trim();
        const leadNum = (text.match(/^\d+/) || [])[0];

        if (leadNum === '2') {
          return sock.sendMessage(chatId, { text: buildHint('Cancelled') }, { quoted: fake });
        }
        if (leadNum === '1') {
          await sock.sendMessage(chatId, { text: buildHint('Goodbye! Leaving the group now.') }, { ...replyOpts() });
          await sock.groupLeave(chatId).catch(() => {});
        }
      });
      setTimeout(() => global.replyHandlers?.delete(handlerKey), 60000);
    }
  }
];
