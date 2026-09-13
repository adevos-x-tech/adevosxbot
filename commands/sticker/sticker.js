'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

function getMediaFromMessage(message) {
  const msg = message.message || {};
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;

  if (msg.stickerMessage) return { type: 'stickerMessage', msg: msg.stickerMessage, dlType: 'sticker' };
  if (msg.imageMessage) return { type: 'imageMessage', msg: msg.imageMessage, dlType: 'image' };
  if (msg.videoMessage) return { type: 'videoMessage', msg: msg.videoMessage, dlType: 'video' };

  if (quoted?.stickerMessage) return { type: 'stickerMessage', msg: quoted.stickerMessage, dlType: 'sticker' };
  if (quoted?.imageMessage) return { type: 'imageMessage', msg: quoted.imageMessage, dlType: 'image' };
  if (quoted?.videoMessage) return { type: 'videoMessage', msg: quoted.videoMessage, dlType: 'video' };

  return null;
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
    name: 'sticker',
    aliases: ['s', 'stiker', 'tosticker'],
    category: 'sticker',
    description: 'Convert image or video to sticker',
    usage: '.sticker (send/reply to image or video)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const media = getMediaFromMessage(message);
      if (!media || media.type === 'stickerMessage') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Sticker',
            fields: [['Send/reply to', 'An image or a short video']],
            commands: ['sticker'],
          })
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const buf = await dlBuffer(media.msg, media.dlType);
        const packname = getSetting('packname', 'Adevos X Bot');
        const author = getSetting('botOwner', 'DAVEX');
        const isAnimated = media.type === 'videoMessage';
        const stickerBuf = await makeSticker(buf, isAnimated, packname, author);

        await sock.sendMessage(chatId, { sticker: stickerBuf }, { quoted: fake, ...replyOpts() });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Sticker failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
