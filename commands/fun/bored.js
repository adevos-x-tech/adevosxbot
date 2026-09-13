'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'bored',
    aliases: ['activity'],
    category: 'fun',
    description: 'Suggest something to do',
    usage: '.bored',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const out = await raceApis([
        async () => { const r = await A('https://www.boredapi.com/api/activity'); return r.data?.activity || null; },
        async () => { const r = await A('https://bored-api.appbrewery.com/random'); return r.data?.activity || null; },
      ]);
      if (!out) return sock.sendMessage(chatId, { text: buildHint("Can't think of anything right now") }, { quoted: fake });
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Try This', fields: [['Activity', out]] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
