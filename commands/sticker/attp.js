'use strict';

const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
const axios = require('axios');

module.exports = [
{
    name: 'attp',
    aliases: ['textanimation', 'tts2sticker'],
    category: 'sticker',
    description: 'Convert text to animated sticker',
    usage: '.attp <text>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const text = args.join(' ').trim();
      if (!text) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .attp <text>', '.attp Hello World') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const apis = [
        `https://apiskeith.top/tool/attp?text=${encodeURIComponent(text)}`,
        `https://api.dreaded.site/api/attp?text=${encodeURIComponent(text)}`,
      ];

      for (const url of apis) {
        try {
          const res = await axios.get(url, { timeout: 30000, responseType: 'arraybuffer' });
          const buf = Buffer.from(res.data);
          if (buf.length < 100) continue;

          const packname = getSetting('packname', 'Adevos X Bot');
          const author = getSetting('botOwner', 'DAVEX');
          const { Sticker, StickerTypes } = require('wa-sticker-formatter');
          const sticker = new Sticker(buf, {
            pack: packname,
            author: author,
            type: StickerTypes.ANIMATED,
            quality: 70,
          });
          const stickerBuf = await sticker.toBuffer();
          await sock.sendMessage(chatId, { sticker: stickerBuf }, { quoted: fake, ...replyOpts() });
          await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
          return;
        } catch (e) {}
      }

      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(chatId, { text: buildHint('ATTP failed. Try again.') }, { quoted: fake });
    }
  }
];
