'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

async function makeSticker(buffer, isAnimated, packname, author) {
  const { Sticker, StickerTypes } = require('wa-sticker-formatter');
  const sticker = new Sticker(buffer, {
    pack: packname || 'Adevos X Bot',
    author: author || 'DAVEX',
    type: isAnimated ? StickerTypes.ANIMATED : StickerTypes.FULL,
    quality: 60,
  });
  return sticker.toBuffer();
}

module.exports = [
{
    name: 'take',
    aliases: ['steal', 'rename', 'rebrand'],
    category: 'sticker',
    description: 'Steal/rebrand a sticker with your pack info',
    usage: '.take [packname] [author] (reply to sticker)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const msg = message.message || {};
      const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
      const stickerMsg = msg.stickerMessage || quoted?.stickerMessage;

      if (!stickerMsg) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a sticker') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const buf = await dlBuffer(stickerMsg, 'sticker');
        const packname = args[0] || getSetting('packname', 'Adevos X Bot');
        const author = args[1] || getSetting('botOwner', 'DAVEX');
        const isAnimated = stickerMsg.isAnimated || false;
        const stickerBuf = await makeSticker(buf, isAnimated, packname, author);

        await sock.sendMessage(chatId, { sticker: stickerBuf }, { quoted: fake, ...replyOpts() });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
