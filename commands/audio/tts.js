'use strict';

const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
const axios = require('axios');

module.exports = [
{
    name: 'tts',
    aliases: ['texttospeech', 'say'],
    category: 'audio',
    description: 'Convert text to speech audio',
    usage: '.tts <text>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const text = args.join(' ').trim();
      if (!text) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .tts <text>', '.tts Hello world!') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const ttsApis = [
        async () => {
          const url = `https://api.dreaded.site/api/tts?text=${encodeURIComponent(text)}&lang=en`;
          const res = await axios.get(url, { timeout: 30000, responseType: 'arraybuffer' });
          return Buffer.from(res.data);
        },
        async () => {
          const url = `https://apiskeith.top/tool/tts?text=${encodeURIComponent(text)}&lang=en`;
          const res = await axios.get(url, { timeout: 30000, responseType: 'arraybuffer' });
          return Buffer.from(res.data);
        },
        async () => {
          const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob&ttsspeed=1`;
          const res = await axios.get(url, {
            timeout: 30000,
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://translate.google.com/',
            }
          });
          return Buffer.from(res.data);
        }
      ];

      let audioBuf = null;
      for (const api of ttsApis) {
        try {
          audioBuf = await api();
          if (audioBuf && audioBuf.length > 500) break;
          audioBuf = null;
        } catch {}
      }

      if (!audioBuf) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        return sock.sendMessage(chatId, { text: buildHint('TTS failed. Try again later.') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, {
        audio: audioBuf,
        mimetype: 'audio/mpeg',
        ptt: false,
        ...replyOpts()
      }, { quoted: fake });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    }
  }
];
