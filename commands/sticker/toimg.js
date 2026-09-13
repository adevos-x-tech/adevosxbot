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
    name: 'toimg',
    aliases: ['toimage', 'stickertoimg', 'webptoimg', 's2img'],
    category: 'sticker',
    description: 'Convert sticker to image (PNG)',
    usage: '.toimg (reply to sticker)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const msg = message.message || {};
      const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
      const stickerMsg = msg.stickerMessage || quoted?.stickerMessage;

      if (!stickerMsg) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a sticker', '.toimg (reply to sticker)') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const buf = await dlBuffer(stickerMsg, 'sticker');

        let imgBuf;
        try {
          const sharp = require('sharp');
          imgBuf = await sharp(buf).png().toBuffer();
        } catch {
          imgBuf = buf;
        }

        await sock.sendMessage(chatId, {
          image: imgBuf,
          caption: `Converted by *${botName}*`,
          ...replyOpts()
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
