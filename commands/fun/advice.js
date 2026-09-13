'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'advice',
    category: 'fun',
    description: 'Get random advice',
    usage: '.advice',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const advice = await raceApis([
        async () => { const r = await A('https://api.adviceslip.com/advice'); return r.data?.slip?.advice || null; },
      ]);
      if (!advice) return sock.sendMessage(chatId, { text: buildHint('No advice available right now') }, { quoted: fake });
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Advice', fields: [['Tip', advice]] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
