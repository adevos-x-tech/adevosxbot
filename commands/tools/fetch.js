'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'fetch',
    aliases: ['fetchurl', 'geturl'],
    category: 'tools',
    description: 'Fetch content from any URL (image, video, audio, PDF, JSON, text)',
    usage: '.fetch <url>',
    execute: async (sock, message, args, context) => {
      const { chatId } = context;
      const fake = createFakeContact(message);

      const url = args.join(' ').trim();
      if (!url) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .fetch <url>', '.fetch https://example.com/file.pdf') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const contentType = res.headers['content-type'] || '';
        const buffer   = Buffer.from(res.data);
        const filename = url.split('/').pop()?.split('?')[0] || 'file';

        if (contentType.includes('application/json')) {
          const json = JSON.parse(buffer.toString());
          await sock.sendMessage(chatId, { text: '```json\n' + JSON.stringify(json, null, 2).slice(0, 4000) + '\n```' }, { quoted: fake });
        } else if (contentType.includes('text/')) {
          await sock.sendMessage(chatId, { text: buffer.toString().slice(0, 4000) }, { quoted: fake });
        } else if (contentType.includes('image')) {
          await sock.sendMessage(chatId, { image: buffer }, { quoted: fake });
        } else if (contentType.includes('video')) {
          await sock.sendMessage(chatId, { video: buffer }, { quoted: fake });
        } else if (contentType.includes('audio')) {
          await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', fileName: filename }, { quoted: fake });
        } else if (contentType.includes('application/pdf')) {
          await sock.sendMessage(chatId, { document: buffer, mimetype: 'application/pdf', fileName: filename }, { quoted: fake });
        } else if (contentType.includes('application/')) {
          await sock.sendMessage(chatId, { document: buffer, mimetype: contentType, fileName: filename }, { quoted: fake });
        } else {
          await sock.sendMessage(chatId, { text: buildHint(`Unsupported content type: ${contentType || 'unknown'}`) }, { quoted: fake });
          return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }

        return sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        let msg = 'Failed to fetch URL.';
        if (err.message?.includes('timeout')) msg = 'Request timed out.';
        else if (err.code === 'ENOTFOUND') msg = 'URL not found (DNS error).';
        else if (err.response?.status === 404) msg = 'Page not found (404).';
        else if (err.response?.status === 403) msg = 'Access denied (403).';

        await sock.sendMessage(chatId, { text: buildHint(msg) }, { quoted: fake });
        return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }
    }
  }
];
