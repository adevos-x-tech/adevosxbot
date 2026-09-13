'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'truth',
    category: 'fun',
    description: 'Truth question',
    usage: '.truth',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const q = await raceApis([
        async () => { const r = await A('https://api.truthordarebot.xyz/api/truth'); return r.data?.question || null; },
      ]);
      if (!q) return sock.sendMessage(chatId, { text: buildHint('Try again in a moment') }, { quoted: fake });
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Truth', fields: [['Question', q]] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
