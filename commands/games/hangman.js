'use strict';
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const HANGMAN_WORDS = [
  'javascript','python','elephant','mountain','butterfly','keyboard','monitor',
  'programming','variable','function','database','algorithm','network','security',
  'chocolate','adventure','universe','diamond','language','software','hardware',
  'internet','password','whatsapp','telegram','android','message',
  'community','festival','lightning','education','treasure','paradise','harmony'
];

const HANGMAN_STAGES = [
  `
  +---+
  |   |
      |
      |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
      |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
  |   |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========`
];

class HangmanGame {
  constructor(chatId, word, starter) {
    this.chatId = chatId;
    this.word = word.toLowerCase();
    this.guessed = new Set();
    this.wrong = 0;
    this.maxWrong = 6;
    this.active = true;
    this.starter = starter;
  }

  guess(letter) {
    letter = letter.toLowerCase();
    if (!this.active) return { result: 'not_active' };
    if (this.guessed.has(letter)) return { result: 'already_guessed' };
    if (!/^[a-z]$/.test(letter)) return { result: 'invalid' };

    this.guessed.add(letter);
    if (this.word.includes(letter)) {
      const won = this.word.split('').every(c => this.guessed.has(c));
      if (won) { this.active = false; return { result: 'won' }; }
      return { result: 'correct' };
    } else {
      this.wrong++;
      if (this.wrong >= this.maxWrong) { this.active = false; return { result: 'lost' }; }
      return { result: 'wrong', wrong: this.wrong };
    }
  }

  display() {
    const wordDisplay = this.word.split('').map(c => this.guessed.has(c) ? c : '_').join(' ');
    const stage = HANGMAN_STAGES[this.wrong] || HANGMAN_STAGES[HANGMAN_STAGES.length - 1];
    const wrongLetters = [...this.guessed].filter(l => !this.word.includes(l)).join(', ');
    return { stage, wordDisplay, wrongLetters, wrong: this.wrong, max: this.maxWrong };
  }
}

const hangmanGames = new Map();

module.exports = [
{
    name: 'hangman',
    aliases: ['hm', 'hang'],
    category: 'games',
    description: 'Play hangman word guessing game',
    usage: '.hangman start | guess <letter> | hint | end',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Hangman',
            fields: [['Rule', 'Guess the hidden word — 6 wrong guesses allowed']],
            commands: ['hangman start — new game', 'hangman guess <letter>', 'hangman hint', 'hangman end'],
          })
        }, { quoted: fake });
      }

      if (sub === 'start') {
        if (hangmanGames.has(chatId)) {
          return sock.sendMessage(chatId, { text: buildHint('Game already running', '.hangman end — to stop') }, { quoted: fake });
        }
        const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
        const game = new HangmanGame(chatId, word, senderId);
        hangmanGames.set(chatId, game);
        const d = game.display();
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Hangman — New Game',
            fields: [
              ['Length', `${word.length} letters`],
              ['Board', `\`\`\`${d.stage}\`\`\``],
              ['Word', d.wordDisplay],
              ['Wrong', `0/${d.max}`],
            ],
            commands: ['hangman guess <letter>'],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'guess' || sub === 'g') {
        const game = hangmanGames.get(chatId);
        if (!game || !game.active) return sock.sendMessage(chatId, { text: buildHint('No active game', '.hangman start') }, { quoted: fake });

        const letter = (args[1] || '').toLowerCase().trim();
        if (!letter || letter.length !== 1) {
          return sock.sendMessage(chatId, { text: buildHint('Guess one letter', '.hangman guess a') }, { quoted: fake });
        }

        const res = game.guess(letter);
        const d = game.display();

        if (res.result === 'already_guessed') return sock.sendMessage(chatId, { text: buildHint(`Already guessed "${letter}"`) }, { quoted: fake });
        if (res.result === 'invalid') return sock.sendMessage(chatId, { text: buildHint('Invalid character') }, { quoted: fake });

        if (res.result === 'won') {
          hangmanGames.delete(chatId);
          return sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Hangman — You Win!', fields: [['Word', game.word], ['Board', `\`\`\`${d.stage}\`\`\``]] })
          }, { quoted: fake, ...replyOpts() });
        }
        if (res.result === 'lost') {
          hangmanGames.delete(chatId);
          return sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Hangman — Game Over', fields: [['Word', game.word], ['Board', `\`\`\`${d.stage}\`\`\``]] })
          }, { quoted: fake, ...replyOpts() });
        }

        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Hangman',
            fields: [
              ['Letter', `${letter.toUpperCase()} — ${res.result === 'correct' ? 'correct' : 'wrong'}`],
              ['Board', `\`\`\`${d.stage}\`\`\``],
              ['Word', d.wordDisplay],
              ['Wrong', `${d.wrong}/${d.max}`],
              ['Bad letters', d.wrongLetters || 'none'],
            ],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'hint') {
        const game = hangmanGames.get(chatId);
        if (!game || !game.active) return sock.sendMessage(chatId, { text: buildHint('No active game') }, { quoted: fake });
        const unguessed = game.word.split('').filter(c => !game.guessed.has(c));
        if (!unguessed.length) return sock.sendMessage(chatId, { text: buildHint('All letters guessed') }, { quoted: fake });
        const hint = unguessed[Math.floor(Math.random() * unguessed.length)];
        return sock.sendMessage(chatId, { text: buildHint(`Hint: the word contains "${hint.toUpperCase()}"`) }, { quoted: fake });
      }

      if (sub === 'end') {
        const game = hangmanGames.get(chatId);
        if (!game) return sock.sendMessage(chatId, { text: buildHint('No game to end') }, { quoted: fake });
        hangmanGames.delete(chatId);
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Hangman Ended', fields: [['Word was', game.word]] }) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, { text: buildHint('Unknown option', '.hangman help') }, { quoted: fake });
    }
  }
];
