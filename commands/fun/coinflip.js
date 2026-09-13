'use strict';

module.exports = {
  name: 'coinflip',
  aliases: ['flip', 'coin', 'headstails'],
  category: 'fun',
  description: 'Flip a coin',
  usage: '.coinflip',
  execute: async (sock, message, args, context) => {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    return context.reply(`Coin flip: ${result}`);
  },
};
