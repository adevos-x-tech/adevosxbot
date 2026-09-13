const axios = require('axios');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { raceApis } = require('../../Adevoslib/raceApi');
const { generateText } = require('../../Adevoslib/aiModels');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

const _A = (url, opts = {}) => axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

module.exports = [
{
    name: 'ai',
    aliases: ['chatgpt', 'gpt', 'ask'],
    category: 'ai',
    description: 'Ask the AI a question',
    usage: '.ai <question>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const question = args.join(' ').trim();
      if (!question) return sock.sendMessage(chatId, { text: buildHint('Ask me anything', '.ai <your question>') }, { quoted: fake });

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const localResult = await generateText(question, {
        maxTokens: 1200,
        system: 'You are Adevos X Bot, a helpful, accurate, and concise WhatsApp assistant.',
      }).catch(() => null);
      const q = encodeURIComponent(question);
      const answer = localResult?.text || await raceApis([
        // PrexzyVilla GPT-5 API (working)
        async () => { const r = await _A(`https://apis.prexzyvilla.site/ai/gpt-5?text=${q}`); return r.data?.status ? (r.data?.text || null) : null; },
        // GiftedTech ChatGPT
        async () => { const r = await _A(`https://api.giftedtech.co.ke/api/ai/chatgpt?apikey=gifted&text=${q}`); return r.data?.result || null; },
        // GiftedTech GPT4
        async () => { const r = await _A(`https://api.giftedtech.co.ke/api/ai/gpt4?apikey=gifted&q=${q}`); return r.data?.result || null; },
        // BK9 OpenAI
        async () => { const r = await _A(`https://api.bk9.dev/ai/openai?q=${q}`); return r.data?.BK9 || r.data?.result || null; },
        // Siputzx GPT3
        async () => { const r = await _A(`https://api.siputzx.my.id/api/ai/gpt3?prompt=${q}&content=user`); return r.data?.data || null; },
      ], { perCallTimeoutMs: 18000 });

      if (!answer || typeof answer !== 'string' || !answer.trim()) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        return sock.sendMessage(chatId, { text: buildHint('AI failed. Try again later.') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      await sock.sendMessage(chatId, {
        text: `*Q:* ${question.substring(0, 100)}\n\n${answer}`,
        ...replyOpts()
      }, { quoted: fake });
    }
  }
];
