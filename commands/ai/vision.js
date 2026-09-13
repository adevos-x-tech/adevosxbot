'use strict';

const { getQuotedImage, generateVision, generateGeminiVision } = require('../../Adevoslib/aiModels');

module.exports = {
  name: 'vision',
  aliases: ['imageai', 'analyzeimage', 'describeimage', 'look'],
  category: 'ai',
  description: 'Analyze a quoted image with a vision model',
  usage: '.vision [question] (reply to an image)',
  execute: async (sock, message, args, context) => {
    const prompt = args.join(' ').trim() || 'Describe this image in detail, accurately and concisely.';
    await context.react('⏳');
    try {
      const image = await getQuotedImage(message, sock);
      if (!image) {
        await context.react('❌');
        return context.reply('Reply to an image first, then use .vision [question].');
      }
      let result = await generateVision(image.buffer, image.mime, prompt, { maxTokens: 1200 });
      if (!result) result = await generateGeminiVision(image.buffer, image.mime, prompt, { maxTokens: 1200 });
      if (!result) {
        await context.react('❌');
        return context.reply('No vision model is configured. Set GROQ_API_KEY/GROQ_API_KEYS or GEMINI_API_KEY.');
      }
      await context.react('✅');
      return context.reply(`*${result.provider === 'gemini' ? 'Gemini' : 'Groq'} / ${result.model}*\n\n${result.text}`);
    } catch (error) {
      await context.react('❌');
      return context.reply(`Vision request failed: ${error.message}`);
    }
  },
};
