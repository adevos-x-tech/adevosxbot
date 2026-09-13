'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

module.exports = [
{
    name: 'copy',
    aliases: ['forward', 'fwd'],
    category: 'tools',
    description: 'Copy/forward a message without the forwarded label',
    usage: '.copy (reply to any message)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const ctx = message.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a message to copy it') }, { quoted: fake });
      }

      try {
        const msgTypes = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
        const foundType = msgTypes.find(t => quoted[t]);
        if (!foundType) {
          return sock.sendMessage(chatId, { text: buildHint("Can't copy this message type") }, { quoted: fake });
        }

        if (foundType === 'conversation' || foundType === 'extendedTextMessage') {
          const text = quoted.conversation || quoted.extendedTextMessage?.text || '';
          await sock.sendMessage(chatId, { text, ...replyOpts() }, { quoted: fake });
        } else {
          const mediaMap = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };
          const dlType = mediaMap[foundType];
          const buf = await dlBuffer(quoted[foundType], dlType);
          const sendObj = { [dlType]: buf };
          if (quoted[foundType]?.caption) sendObj.caption = quoted[foundType].caption;
          if (quoted[foundType]?.mimetype) sendObj.mimetype = quoted[foundType].mimetype;
          if (foundType === 'documentMessage') sendObj.fileName = quoted[foundType].fileName || 'file';
          if (foundType === 'audioMessage' && quoted[foundType].ptt) sendObj.ptt = true;
          await sock.sendMessage(chatId, sendObj, { quoted: fake });
        }
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
