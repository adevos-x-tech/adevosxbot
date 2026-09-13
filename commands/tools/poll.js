'use strict';

module.exports = {
  name: 'poll',
  aliases: ['vote', 'survey'],
  category: 'tools',
  description: 'Create a single-choice poll',
  usage: '.poll Question | Option 1 | Option 2',
  execute: async (sock, message, args, context) => {
    const parts = args.join(' ').split('|').map(value => value.trim()).filter(Boolean);
    if (parts.length < 3) return context.reply('Usage: .poll Question | Option 1 | Option 2');
    const [name, ...values] = parts;
    const uniqueValues = [...new Set(values)].slice(0, 12);
    if (name.length > 300 || uniqueValues.some(value => value.length > 100)) return context.reply('Question/options are too long.');
    return sock.sendMessage(context.chatId, {
      poll: {
        name,
        values: uniqueValues,
        selectableCount: 1,
      },
    }, { quoted: context.fake });
  },
};
