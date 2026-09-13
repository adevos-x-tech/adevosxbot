'use strict';

const ALLOWED = /^[0-9+\-*/.()%\s]+$/;

module.exports = {
  name: 'calc',
  aliases: ['calculate', 'math', 'solve'],
  category: 'tools',
  description: 'Evaluate a mathematical expression',
  usage: '.calc 2+2',
  execute: async (sock, message, args, context) => {
    const expression = args.join(' ').trim();
    if (!expression) return context.reply('Usage: .calc 2+2');
    if (!ALLOWED.test(expression)) return context.reply('Only numbers and arithmetic operators are allowed.');
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      if (result === undefined || result === null || !Number.isFinite(Number(result))) throw new Error('invalid result');
      return context.reply(`${expression}\n= ${result}`);
    } catch {
      return context.reply('That expression is invalid.');
    }
  },
};
