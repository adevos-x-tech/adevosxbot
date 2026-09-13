'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

// ── Football-data.org (requires API key) ──
const FD_KEY = '7b6507c792f74a2b9db41cfc8fd8cf05';
const FD_URL = 'https://api.football-data.org/v4/competitions';

const fetchFD = async (endpoint) => {
  const res = await axios.get(`${FD_URL}/${endpoint}`, {
    headers: { 'X-Auth-Token': FD_KEY },
    timeout: 12000,
  });
  return res.data;
};

async function _fdStandings(sock, chatId, message, code, title, relegationPos, euroPos) {
  const fake = createFakeContact(message);
  const botName = getBotName();
  await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
  try {
    const data = await fetchFD(`${code}/standings`);
    if (!data?.standings) throw new Error('No standings data');
    const table = data.standings[0].table;

    const fields = table.slice(0, 20).map((team, i) => {
      const pos = i + 1;
      const zone = pos <= (euroPos || 4) ? 'Euro' : pos >= (relegationPos || 18) ? 'Relegation' : '';
      const stats = `${team.playedGames}G ${team.won}W ${team.draw}D ${team.lost}L | ${team.goalsFor}:${team.goalsAgainst} (${team.goalDifference > 0 ? '+' : ''}${team.goalDifference}) | ${team.points} pts${zone ? ' — ' + zone : ''}`;
      return [`${pos}. ${team.team.name}`, stats];
    });

    await sock.sendMessage(chatId, { text: buildFrame({ title, fields }), ...replyOpts() }, { quoted: fake });
    return sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (err) {
    await sock.sendMessage(chatId, { text: buildHint(err.message) }, { quoted: fake });
    return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
  }
}

module.exports = [
{
    name: 'epl',
    aliases: ['eplstandings', 'premierleague', 'pl'],
    category: 'sports',
    description: 'Premier League standings',
    execute: (sock, message, args, context) => _fdStandings(sock, context.chatId, message, 'PL', 'PREMIER LEAGUE', 18, 4)
  }
];
