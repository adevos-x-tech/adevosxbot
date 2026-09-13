const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

const _A = (url, opts = {}) => axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'imagine',
    aliases: ['dalle', 'dream', 'genimage', 'image', 'imggen', 'aiimage', 'text2image', 'txt2img', 'toanime', 'toghibli', 'remini', 'wallpaper'],
    category: 'ai',
    description: 'Generate AI image from prompt',
    usage: '.imagine <prompt>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const prompt = args.join(' ').trim();
      if (!prompt) return sock.sendMessage(chatId, { text: buildHint('Provide a prompt', '.imagine <description>') }, { quoted: fake });

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const p = encodeURIComponent(prompt);
      const fetchBuf = async (url) => {
        try {
          const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 35000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const buf = Buffer.from(r.data);
          return buf.length > 5000 ? buf : null;
        } catch { return null; }
      };
      const fromJsonUrl = async (jsonUrl) => {
        try {
          const r = await _A(jsonUrl, { timeout: 35000 });
          const u = r.data?.result?.url || r.data?.result || r.data?.url || r.data?.image || r.data?.data?.url || null;
          if (!u || typeof u !== 'string' || !u.startsWith('http')) return null;
          return fetchBuf(u);
        } catch { return null; }
      };

      const imageBuf = await raceApis([
        // Pollinations (working, direct image)
        async () => fetchBuf(`https://image.pollinations.ai/prompt/${p}`),
        // GiftedTech Stable Diffusion
        async () => fromJsonUrl(`https://api.giftedtech.co.ke/api/ai/stablediffusion?apikey=gifted&prompt=${p}`),
        // Siputzx Stable Diffusion
        async () => fromJsonUrl(`https://api.siputzx.my.id/api/ai/stable-diffusion?prompt=${p}`),
        // BK9 image generation
        async () => fromJsonUrl(`https://api.bk9.dev/ai/image?prompt=${p}`),
      ], { perCallTimeoutMs: 40000 });

      if (!imageBuf) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        return sock.sendMessage(chatId, { text: buildHint('Image generation failed. Try again later.') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, {
        image: imageBuf,
        caption: `*${botName} AI Image*\n_${prompt}_`,
        ...replyOpts()
      }, { quoted: fake });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    }
  }
];
