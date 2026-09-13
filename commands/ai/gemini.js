'use strict';

const { generateGemini } = require('../../Adevoslib/aiModels');

module.exports = {
  name: 'gemini',
  aliases: ['googleai', 'bard'],
  category: 'ai',
  description: 'Ask a Google Gemini text model',
  usage: '.gemini <prompt>',
  execute: async (sock, message, args, context) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return context.reply('Usage: .gemini <prompt>');
    await context.react('⏳');
    try {
      const result = await generateGemini(prompt, {
        maxTokens: 1200,
        system: 'You are Adevos X Bot, a helpful, accurate, and concise WhatsApp assistant.',
      });
      if (!result) return context.reply('Gemini is not configured or all Gemini models failed. Set GEMINI_API_KEY.');
      await context.react('✅');
      return context.reply(`*${result.model}*\n\n${result.text}`);
    } catch (error) {
      await context.react('❌');
      return context.reply(`Gemini request failed: ${error.message}`);
    }
  },
};
