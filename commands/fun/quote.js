'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'quote',
    aliases: ['inspire'],
    category: 'fun',
    description: 'Inspirational quote',
    usage: '.quote',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      let quoteText = null, author = null;
      const ok = await raceApis([
        async () => { const r = await A('https://zenquotes.io/api/random'); const q = r.data?.[0]; if (!q) return null; quoteText = q.q; author = q.a; return true; },
        async () => { const r = await A('https://api.kanye.rest/'); if (!r.data?.quote) return null; quoteText = r.data.quote; author = 'Kanye'; return true; },
      ]);
      if (!ok) return sock.sendMessage(chatId, { text: buildHint('No quote available right now') }, { quoted: fake });
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Quote', fields: [['Quote', quoteText], ['Author', author]] })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
