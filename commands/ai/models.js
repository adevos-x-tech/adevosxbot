'use strict';

const { DEFAULT_TEXT_MODELS, DEFAULT_VISION_MODELS, readKeys } = require('../../Adevoslib/aiModels');
const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');

module.exports = {
  name: 'models',
  aliases: ['aimodels', 'model', 'aihelp'],
  category: 'ai',
  description: 'Show available AI text and vision model routes',
  usage: '.models',
  execute: async (sock, message, args, context) => {
    const { chatId } = context;
    const fake = createFakeContact(message);
    const groqConfigured = readKeys().length > 0;
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

    return sock.sendMessage(chatId, {
      text: buildFrame({
        title: 'AI Models',
        fields: [
          ['Text fallback', DEFAULT_TEXT_MODELS.join(' -> ')],
          ['Vision fallback', DEFAULT_VISION_MODELS.join(' -> ')],
          ['Groq', groqConfigured ? 'Configured' : 'Not configured'],
          ['Gemini', geminiConfigured ? 'Configured' : 'Not configured'],
        ],
        commands: [
          'ai <prompt> — multi-provider AI',
          'groq [fast|70b|model-id] <prompt>',
          'gemini <prompt>',
          'vision [question] — reply to an image',
        ],
      }),
      ...replyOpts()
    }, { quoted: fake });
  },
};
