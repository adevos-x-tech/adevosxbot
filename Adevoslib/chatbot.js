const axios = require('axios');
const { generateText } = require('./aiModels');
const { raceApis } = require('./raceApi');

const A = (url, opts = {}) => axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });

/**
 * getReply — generates a conversational AI reply to the given text.
 * Used by case.js's handleChatbot when a user tags/replies to the bot
 * in an enabled chat. Reuses the same model/API chain as the .ai command.
 */
async function getReply(text) {
  if (!text || !text.trim()) return null;

  const local = await generateText(text, {
    maxTokens: 400,
    system: 'You are Adevos-X Bot, a friendly and concise WhatsApp chat companion. Keep replies short and conversational.',
  }).catch(() => null);
  if (local?.text) return local.text.trim();

  const q = encodeURIComponent(text);
  const answer = await raceApis([
    async () => { const r = await A(`https://apis.prexzyvilla.site/ai/gpt-5?text=${q}`); return r.data?.status ? (r.data?.text || null) : null; },
    async () => { const r = await A(`https://api.giftedtech.co.ke/api/ai/chatgpt?apikey=gifted&text=${q}`); return r.data?.result || null; },
    async () => { const r = await A(`https://api.bk9.dev/ai/openai?q=${q}`); return r.data?.BK9 || r.data?.result || null; },
  ], { perCallTimeoutMs: 15000 }).catch(() => null);

  return (typeof answer === 'string' && answer.trim()) ? answer.trim() : null;
}

module.exports = { getReply };
