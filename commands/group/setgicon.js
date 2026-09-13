const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'setgicon',
    aliases: ['setgphoto', 'setgpp', 'groupicon', 'groupphoto'],
    category: 'group',
    description: 'Set the group icon by replying to an image',
    usage: '.setgicon (reply to image)',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      if (!isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });

      const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const imgMsg = quotedMsg?.imageMessage || message.message?.imageMessage;
      if (!imgMsg) return sock.sendMessage(chatId, { text: buildHint('Reply to an image to set as the group icon') }, { quoted: fake });

      try {
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        let buf = Buffer.alloc(0);
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        await sock.updateProfilePicture(chatId, buf);
        return sock.sendMessage(chatId, { text: buildHint('Group icon updated') }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
