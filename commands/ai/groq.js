'use strict';

const { generateText } = require('../../Adevoslib/aiModels');

const HINTS = new Set(['fast', 'small', '8b', '70b', 'quality', 'large']);

module.exports = {
  name: 'groq',
  aliases: ['llama', 'groqai'],
  category: 'ai',
  description: 'Ask a Groq-hosted text model',
  usage: '.groq [fast|70b|model-id] <prompt>',
  execute: async (sock, message, args, context) => {
    let model;
    if (args.length && (HINTS.has(String(args[0]).toLowerCase()) || /^llama-|^meta-llama\//i.test(args[0]))) model = args.shift();
    const prompt = args.join(' ').trim();
    if (!prompt) return context.reply('Usage: .groq [fast|70b|model-id] <prompt>');
    await context.react('⏳');
    try {
      const result = await generateText(prompt, {
        model,
        maxTokens: 1200,
        system: 'You are Adevos X Bot, a helpful, accurate, and concise WhatsApp assistant.',
      });
      if (!result) return context.reply('Groq is not configured or all configured models failed. Set GROQ_API_KEY or GROQ_API_KEYS.');
      await context.react('✅');
      return context.reply(`*${result.model}*\n\n${result.text}`);
    } catch (error) {
      await context.react('❌');
      return context.reply(`Groq request failed: ${error.message}`);
    }
  },
};
