'use strict';

module.exports = {
  name: 'base64',
  aliases: ['b64', 'tobase64', 'base64decode', 'decode64'],
  category: 'tools',
  description: 'Encode or decode Base64 text',
  usage: '.base64 <text> or .base64 decode <base64>',
  execute: async (sock, message, args, context) => {
    if (!args.length) return context.reply('Usage: .base64 <text>\nOr: .base64 decode <base64>');
    const mode = String(args[0]).toLowerCase();
    const isDecode = ['decode', 'dec', 'frombase64', 'unbase64'].includes(mode);
    const value = (isDecode ? args.slice(1) : args).join(' ');
    if (!value) return context.reply(isDecode ? 'Provide Base64 text to decode.' : 'Provide text to encode.');
    if (value.length > 12000) return context.reply('Input is too large. Maximum is 12,000 characters.');
    try {
      if (isDecode) {
        const compact = value.replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) throw new Error('invalid base64');
        return context.reply(Buffer.from(compact, 'base64').toString('utf8'));
      }
      return context.reply(Buffer.from(value, 'utf8').toString('base64'));
    } catch {
      return context.reply('Invalid Base64 input.');
    }
  },
};
