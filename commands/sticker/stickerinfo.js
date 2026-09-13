'use strict';

const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'stickerinfo',
    aliases: ['stickermeta', 'sinfo'],
    category: 'sticker',
    description: 'Show technical info about a sticker',
    usage: '.stickerinfo (reply to sticker)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const msg = message.message || {};
      const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
      const stickerMsg = msg.stickerMessage || quoted?.stickerMessage;

      if (!stickerMsg) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a sticker') }, { quoted: fake });
      }

      const isAnimated = stickerMsg.isAnimated ? 'Yes' : 'No';
      const fileLen = stickerMsg.fileLength ? `${stickerMsg.fileLength} bytes` : 'Unknown';
      const mediaKey = (stickerMsg.mediaKey || '').toString('base64')?.slice(0, 20) || 'N/A';

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Sticker Info',
          fields: [
            ['Animated', isAnimated],
            ['Size', fileLen],
            ['Media key', `${mediaKey}...`],
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
