'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildHint } = require('../../Adevoslib/frame');

const A = (url, opts = {}) => axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

async function _img(url) {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  return Buffer.from(r.data);
}

module.exports = [
{
    name: 'cat',
    category: 'fun',
    description: 'Random cat picture',
    usage: '.cat',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      try {
        const url = await raceApis([
          async () => { const r = await A('https://api.thecatapi.com/v1/images/search'); return r.data?.[0]?.url || null; },
          async () => { const r = await A('https://cataas.com/cat?json=true'); return r.data?.url || (r.data?._id ? `https://cataas.com/cat/${r.data._id}` : null); },
        ]);
        if (!url) throw new Error('no img');
        const buf = await _img(url);
        await sock.sendMessage(chatId, { image: buf, caption: getBotName() }, { quoted: fake });
      } catch {
        await sock.sendMessage(chatId, { text: buildHint('No cat picture available right now') }, { quoted: fake });
      }
    }
  }
];
