'use strict';

const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

async function gifToMp4(gifBuf) {
  const id = crypto.randomBytes(6).toString('hex');
  const gifPath = path.join(os.tmpdir(), `davex_${id}.gif`);
  const mp4Path = path.join(os.tmpdir(), `davex_${id}.mp4`);
  fs.writeFileSync(gifPath, gifBuf);
  execFileSync('ffmpeg', [
    '-loglevel', 'error',
    '-i', gifPath,
    '-movflags', 'faststart',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-y', mp4Path
  ], { timeout: 30000, stdio: ['ignore', 'ignore', 'pipe'] });
  const mp4 = fs.readFileSync(mp4Path);
  try { fs.unlinkSync(gifPath); fs.unlinkSync(mp4Path); } catch {}
  return mp4;
}

const NEKOS_CATEGORIES = [
  'neko', 'husbando', 'kitsune', 'waifu', 'shinobu', 'megumin', 'bully',
  'cuddle', 'cry', 'hug', 'awoo', 'kiss', 'lick', 'pat', 'smug', 'bonk',
  'yeet', 'blush', 'smile', 'wave', 'highfive', 'handhold', 'nom', 'bite',
  'glomp', 'slap', 'kick', 'happy', 'wink', 'poke', 'dance', 'cringe',
];

async function fetchAnimeImg(category) {
  // Race providers in parallel — first valid url wins. waifu.pics removed (dead).
  const apis = [
    async () => {
      const res = await axios.get(`https://nekos.best/api/v2/${category}`, { timeout: 12000 });
      return res.data?.results?.[0]?.url;
    },
    async () => {
      const res = await axios.get(`https://api.waifu.im/search?included_tags=${encodeURIComponent(category)}`, { timeout: 12000 });
      return res.data?.images?.[0]?.url;
    },
    async () => {
      const res = await axios.get(`https://nekos.life/api/v2/img/${category}`, { timeout: 12000 });
      return res.data?.url;
    },
  ];
  try {
    return await Promise.any(apis.map(async fn => {
      const url = await fn();
      if (url && typeof url === 'string' && url.startsWith('http')) return url;
      throw new Error('empty');
    }));
  } catch { return null; }
}

async function downloadImg(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  return Buffer.from(res.data);
}

function buildAnimeCommand(name, category) {
  return {
    name,
    category: 'anime',
    description: `Random ${name} anime image/gif`,
    usage: `.${name}`,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const imgUrl = await fetchAnimeImg(category);
        if (!imgUrl) throw new Error('No image found');
        const buf = await downloadImg(imgUrl);
        const isGif = imgUrl.endsWith('.gif');

        if (isGif) {
          const mp4 = await gifToMp4(buf);
          await sock.sendMessage(chatId, {
            video: mp4,
            gifPlayback: true,
            mimetype: 'video/mp4',
            caption: `*${botName}* | ${name.toUpperCase()}`,
            ...replyOpts()
          }, { quoted: fake });
        } else {
          await sock.sendMessage(chatId, {
            image: buf,
            caption: `*${botName}* | ${name.toUpperCase()}`,
            ...replyOpts()
          }, { quoted: fake });
        }
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  };
}

const animeCommands = NEKOS_CATEGORIES.map(cat => buildAnimeCommand(cat, cat));

module.exports = [
  ...animeCommands,
  {
    name: 'animemenu',
    aliases: ['animes', 'animelist'],
    category: 'anime',
    description: 'Show all anime commands',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const prefix = global.prefix || '.';

      const cats = NEKOS_CATEGORIES.map(c => `${prefix}${c}`).join(', ');
      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Anime Commands', fields: [['Available', cats]] }),
        ...replyOpts()
      }, { quoted: fake });
    }
  }
];
