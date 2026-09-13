'use strict';
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { getWordChainGame } = require('./wordchain');

module.exports = [
{
    name: 'wcgai',
    aliases: ['wordchainai', 'wcai'],
    category: 'games',
    description: 'Play word chain against the AI',
    usage: '.wcgai start <word>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderNumber } = context;
      const name = message.pushName || senderNumber || 'Player';
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();
      const game = getWordChainGame(chatId);

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Word Chain — vs AI',
            commands: ['wcgai start <word> — begin', 'wordchain play <word> — your turn', 'wordchain end — stop'],
          })
        }, { quoted: fake });
      }

      if (sub === 'start') {
        if (game.active) return sock.sendMessage(chatId, { text: buildHint('Game already running') }, { quoted: fake });
        const startWord = (args[1] || '').toLowerCase();
        if (!startWord || !/^[a-z]+$/.test(startWord) || startWord.length < 2) {
          return sock.sendMessage(chatId, { text: buildHint('Provide a valid start word', '.wcgai start apple') }, { quoted: fake });
        }
        if (!game.players.has(senderId)) game.addPlayer(senderId, name);
        game.players.set('__AI__', 'BOT');
        game.scores.set('__AI__', 0);
        game.start(startWord, true);
        const curName = game.currentPlayer === '__AI__' ? 'AI' : (game.players.get(game.currentPlayer) || name);
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Word Chain vs AI — Started',
            fields: [['Start word', startWord], ['Turn', curName], ['Next word starts with', startWord[startWord.length - 1].toUpperCase()]],
            commands: ['wordchain play <word>'],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, { text: buildHint('Use: .wcgai start <word>') }, { quoted: fake });
    }
  }
];
