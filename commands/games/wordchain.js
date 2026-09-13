'use strict';
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

class WordChainGame {
  constructor(chatId) {
    this.chatId = chatId;
    this.players = new Map();
    this.usedWords = new Set();
    this.lastWord = '';
    this.currentPlayer = null;
    this.turnOrder = [];
    this.turnIndex = 0;
    this.active = false;
    this.scores = new Map();
    this.aiMode = false;
    this.turnTimer = null;
    this.TURN_TIMEOUT = 60000;
  }

  addPlayer(jid, name) {
    if (this.players.has(jid)) return false;
    this.players.set(jid, name);
    this.scores.set(jid, 0);
    return true;
  }

  start(startWord, aiMode = false) {
    if (this.players.size < (aiMode ? 1 : 2)) return false;
    this.active = true;
    this.aiMode = aiMode;
    this.usedWords.clear();
    this.lastWord = startWord.toLowerCase();
    this.usedWords.add(this.lastWord);
    this.turnOrder = [...this.players.keys()];
    if (aiMode && !this.turnOrder.includes('__AI__')) this.turnOrder.push('__AI__');
    this.turnIndex = 0;
    this.currentPlayer = this.turnOrder[0];
    return true;
  }

  submitWord(jid, word) {
    word = word.toLowerCase().trim();
    if (!this.active) return { ok: false, reason: 'not_started' };
    if (this.currentPlayer !== jid) return { ok: false, reason: 'not_your_turn' };
    if (word[0] !== this.lastWord[this.lastWord.length - 1]) return { ok: false, reason: 'wrong_start', expected: this.lastWord[this.lastWord.length - 1] };
    if (this.usedWords.has(word)) return { ok: false, reason: 'already_used' };
    if (word.length < 2) return { ok: false, reason: 'too_short' };
    if (!/^[a-z]+$/.test(word)) return { ok: false, reason: 'invalid_chars' };

    this.usedWords.add(word);
    this.lastWord = word;
    const pts = word.length;
    this.scores.set(jid, (this.scores.get(jid) || 0) + pts);
    this.nextTurn();
    return { ok: true, pts };
  }

  nextTurn() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
    this.currentPlayer = this.turnOrder[this.turnIndex];
  }

  getAiWord() {
    const lastChar = this.lastWord[this.lastWord.length - 1];
    const candidates = AI_WORD_LIST.filter(w =>
      w[0] === lastChar && !this.usedWords.has(w) && w.length >= 3
    );
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  getScores() {
    const lines = [];
    for (const [jid, name] of this.players) {
      if (jid === '__AI__') continue;
      lines.push(`${name}: ${this.scores.get(jid) || 0} pts`);
    }
    return lines.join('\n');
  }

  end() {
    this.active = false;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    let winner = null;
    let max = -1;
    for (const [jid, score] of this.scores) {
      if (jid === '__AI__') continue;
      if (score > max) { max = score; winner = this.players.get(jid); }
    }
    return { winner, scores: this.getScores() };
  }
}

const AI_WORD_LIST = [
  'apple','elephant','tiger','rain','nature','egg','great','table','engine','every',
  'year','ring','gate','eagle','light','top','pen','night','tree','easy','year',
  'road','dance','ear','rose','edge','game','enter','red','door','right','tall',
  'link','king','god','diamond','moon','name','earth','home','end','dog','grow',
  'water','real','leaf','fan','nest','time','early','yarn','need','dream','magic',
  'ice','cave','evening','girl','list','trunk','kin','night','grace','edge',
  'lamp','pear','river','run','north','hat','type','eat','art','ten','net','time',
  'iron','ocean','node','empty','yawn','wall','low','well','late','elder','ring',
  'giant','tiger','error','race','calm','money','yarn','nine','example','yard'
];

const wordChainGames = new Map();

function getWordChainGame(chatId) {
  if (!wordChainGames.has(chatId)) wordChainGames.set(chatId, new WordChainGame(chatId));
  return wordChainGames.get(chatId);
}

module.exports = [
{
    name: 'wordchain',
    aliases: ['wc', 'wcg'],
    category: 'games',
    description: 'Play word chain game',
    usage: '.wordchain start <word> | join | play <word> | scores | end',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderNumber } = context;
      const name = message.pushName || senderNumber || 'Player';
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();
      const game = getWordChainGame(chatId);

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Word Chain',
            fields: [['Rule', 'Each word must start with the last letter of the previous word']],
            commands: [
              'wordchain join — join game',
              'wordchain start <word> — begin',
              'wordchain play <word> — your turn',
              'wordchain scores — see scores',
              'wordchain end — end game',
              'wcgai start <word> — AI mode',
            ],
          })
        }, { quoted: fake });
      }

      if (sub === 'join') {
        if (game.active) return sock.sendMessage(chatId, { text: buildHint('Game already running') }, { quoted: fake });
        const added = game.addPlayer(senderId, name);
        if (!added) return sock.sendMessage(chatId, { text: buildHint('You already joined') }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Word Chain', fields: [['Joined', name], ['Players', String(game.players.size)]], commands: ['wordchain start <word> — needs 2+ players'] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'start') {
        if (game.active) return sock.sendMessage(chatId, { text: buildHint('Game already running') }, { quoted: fake });
        const startWord = (args[1] || '').toLowerCase();
        if (!startWord || !/^[a-z]+$/.test(startWord) || startWord.length < 2) {
          return sock.sendMessage(chatId, { text: buildHint('Provide a valid start word', '.wordchain start apple') }, { quoted: fake });
        }
        if (!game.players.has(senderId)) game.addPlayer(senderId, name);
        if (game.players.size < 2) return sock.sendMessage(chatId, { text: buildHint('Need at least 2 players', 'Others can join with .wordchain join') }, { quoted: fake });
        game.start(startWord, false);
        const curName = game.players.get(game.currentPlayer) || 'Unknown';
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Word Chain — Started',
            fields: [['Start word', startWord], ['Turn', curName], ['Next word starts with', startWord[startWord.length - 1].toUpperCase()]],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'play' || sub === 'w') {
        if (!game.active) return sock.sendMessage(chatId, { text: buildHint('No game running', '.wordchain join') }, { quoted: fake });
        const word = (args[1] || '').toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: buildHint('Provide a word', '.wordchain play <word>') }, { quoted: fake });

        const res = game.submitWord(senderId, word);
        if (!res.ok) {
          const reasons = {
            not_your_turn: `Not your turn — waiting for ${game.players.get(game.currentPlayer) || 'AI'}`,
            wrong_start: `Word must start with "${res.expected?.toUpperCase()}"`,
            already_used: `"${word}" already used`,
            too_short: 'Word too short (min 2 letters)',
            invalid_chars: 'Letters only',
            not_started: 'Game not started',
          };
          return sock.sendMessage(chatId, { text: buildHint(reasons[res.reason] || 'Invalid word') }, { quoted: fake });
        }

        const fields = [['Accepted', `${name}: "${word}" (+${res.pts}pts)`]];

        if (game.aiMode && game.currentPlayer === '__AI__') {
          const aiWord = game.getAiWord();
          if (!aiWord) {
            const result = game.end();
            fields.push(['AI', "Can't continue"], ['Winner', result.winner || 'None'], ['Scores', result.scores]);
            wordChainGames.delete(chatId);
          } else {
            game.usedWords.add(aiWord);
            game.scores.set('__AI__', (game.scores.get('__AI__') || 0) + aiWord.length);
            game.lastWord = aiWord;
            game.nextTurn();
            const curName = game.players.get(game.currentPlayer) || 'Player';
            fields.push(['AI played', aiWord], ['Turn', curName], ['Next starts with', aiWord[aiWord.length - 1].toUpperCase()]);
          }
        } else {
          const curName = game.currentPlayer === '__AI__' ? 'AI' : (game.players.get(game.currentPlayer) || 'Unknown');
          fields.push(['Turn', curName], ['Next starts with', word[word.length - 1].toUpperCase()]);
        }

        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Word Chain', fields }) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'scores') {
        if (!game.active && game.players.size === 0) return sock.sendMessage(chatId, { text: buildHint('No active game') }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Word Chain — Scores', fields: [['Scores', game.getScores() || 'No scores yet'], ['Last word', game.lastWord || '-']] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'end') {
        if (!game.active) return sock.sendMessage(chatId, { text: buildHint('No game running') }, { quoted: fake });
        const result = game.end();
        wordChainGames.delete(chatId);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Word Chain Ended', fields: [['Winner', result.winner || 'None'], ['Final scores', result.scores || 'No scores']] })
        }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, { text: buildHint('Unknown sub-command', '.wordchain help') }, { quoted: fake });
    }
  }
];

module.exports.getWordChainGame = getWordChainGame;
