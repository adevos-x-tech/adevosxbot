'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: '8ball',
    aliases: ['eightball'],
    category: 'fun',
    description: 'Magic 8-ball',
    usage: '.8ball <question>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const q = (args || []).join(' ').trim();
      if (!q) return sock.sendMessage(chatId, { text: buildHint('Ask the 8-ball a yes/no question', '.8ball <question>') }, { quoted: fake });
      const ans = (await raceApis([
        async () => { const r = await A('https://api.popcat.xyz/8ball'); return r.data?.answer || null; },
        async () => { const r = await A('https://yesno.wtf/api'); return r.data?.answer || null; },
      ])) || ['Yes', 'No', 'Maybe', 'Definitely', 'Ask again later'][Math.floor(Math.random() * 5)];
      return sock.sendMessage(chatId, { text: buildFrame({ title: '8-Ball', fields: [['Q', q], ['A', ans]] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
