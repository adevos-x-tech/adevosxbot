'use strict';

module.exports = {
  name: 'dice',
  aliases: ['roll', 'rolldice', 'd6'],
  category: 'fun',
  description: 'Roll one or more dice',
  usage: '.dice [count]',
  execute: async (sock, message, args, context) => {
    const requested = Number.parseInt(args[0] || '1', 10);
    const count = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), 10);
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
    return context.reply(`Rolls: ${rolls.join(', ')}\nTotal: ${rolls.reduce((sum, value) => sum + value, 0)}`);
  },
};
