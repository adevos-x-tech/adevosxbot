'use strict';

const { complete } = require('../../Adevoslib/aiModels');

const histories = new Map();
const MAX_MESSAGES = 12;
const MAX_CHATS = 200;

function getHistory(chatId) {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId);
}

function trimChats() {
  while (histories.size > MAX_CHATS) histories.delete(histories.keys().next().value);
}

module.exports = {
  name: 'chat',
  aliases: ['conversation', 'talk'],
  category: 'ai',
  description: 'Chat with a Groq text model using short in-memory context',
  usage: '.chat <message> | .chat clear',
  execute: async (sock, message, args, context) => {
    const chatId = context.chatId || message.key?.remoteJid || 'unknown-chat';
    const prompt = args.join(' ').trim();
    const history = getHistory(chatId);
    if (!prompt || /^(clear|reset|forget)$/i.test(prompt)) {
      history.splice(0, history.length);
      return context.reply(prompt ? 'Chat history cleared.' : 'Usage: .chat <message> | .chat clear');
    }
    history.push({ role: 'user', content: prompt });
    while (history.length > MAX_MESSAGES) history.shift();
    trimChats();
    await context.react('⏳');
    try {
      const result = await complete([
        { role: 'system', content: 'You are Adevos X Bot, a helpful conversational WhatsApp assistant. Use the recent context, but do not claim to remember anything outside it.' },
        ...history,
      ], { model: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile', maxTokens: 1200 });
      if (!result) {
        history.pop();
        await context.react('❌');
        return context.reply('Chat AI is not configured or all configured models failed. Set GROQ_API_KEY or GROQ_API_KEYS.');
      }
      history.push({ role: 'assistant', content: result.text });
      while (history.length > MAX_MESSAGES) history.shift();
      await context.react('✅');
      return context.reply(`*${result.model}*\n\n${result.text}`);
    } catch (error) {
      history.pop();
      await context.react('❌');
      return context.reply(`Chat request failed: ${error.message}`);
    }
  },
};
