'use strict';

const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'joke',
    aliases: ['randomjoke'],
    category: 'fun',
    description: 'Get a random joke',
    usage: '.joke',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      let setup = null, punchline = null;
      const joke = await raceApis([
        async () => { const r = await A('https://official-joke-api.appspot.com/random_joke'); if (!r.data?.setup) return null; setup = r.data.setup; punchline = r.data.punchline; return true; },
        async () => { const r = await A('https://api.popcat.xyz/joke'); if (!r.data?.joke) return null; setup = r.data.joke; punchline = null; return true; },
        async () => { const r = await A('https://v2.jokeapi.dev/joke/Any?type=twopart'); if (!r.data?.setup) return null; setup = r.data.setup; punchline = r.data.delivery; return true; },
      ]);
      if (!joke) return sock.sendMessage(chatId, { text: buildHint('No joke available right now') }, { quoted: fake });
      const fields = [['Setup', setup]];
      if (punchline) fields.push(['Punchline', punchline]);
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Joke', fields }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
