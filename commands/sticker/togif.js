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

function getMediaFromMessage(message) {
  const msg = message.message || {};
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;

  if (msg.stickerMessage) return { type: 'stickerMessage', msg: msg.stickerMessage, dlType: 'sticker' };
  if (msg.videoMessage) return { type: 'videoMessage', msg: msg.videoMessage, dlType: 'video' };

  if (quoted?.stickerMessage) return { type: 'stickerMessage', msg: quoted.stickerMessage, dlType: 'sticker' };
  if (quoted?.videoMessage) return { type: 'videoMessage', msg: quoted.videoMessage, dlType: 'video' };

  return null;
}

module.exports = [
{
    name: 'togif',
    aliases: ['s2gif', 'stickertogif'],
    category: 'sticker',
    description: 'Convert animated sticker or video to GIF',
    usage: '.togif (reply to animated sticker/video)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const media = getMediaFromMessage(message);
      if (!media) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to an animated sticker or video with .togif') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const buf = await dlBuffer(media.msg, media.dlType);
        await sock.sendMessage(chatId, {
          video: buf,
          gifPlayback: true,
          caption: `GIF by *${botName}*`,
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
