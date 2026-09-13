'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'fact',
    aliases: ['uselessfact'],
    category: 'fun',
    description: 'Get a random useless fact',
    usage: '.fact',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const fact = await raceApis([
        async () => { const r = await A('https://uselessfacts.jsph.pl/api/v2/facts/random'); return r.data?.text || null; },
        async () => { const r = await A('https://api.popcat.xyz/fact'); return r.data?.fact || null; },
      ]);
      if (!fact) return sock.sendMessage(chatId, { text: buildHint('No fact available right now') }, { quoted: fake });
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Fact', fields: [['Did you know', fact]] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
