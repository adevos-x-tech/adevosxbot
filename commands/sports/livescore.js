'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const SPORTS_API = 'https://apis.prexzyvilla.site/sports/football';

const getLiveMatches = async () => {
  const res = await axios.get(SPORTS_API, { timeout: 12000 });
  if (!res.data?.status) throw new Error('No data from API');
  return res.data.data.matches;
};

module.exports = [
{
    name: 'livescore',
    aliases: ['livescores', 'live', 'scores'],
    category: 'sports',
    description: 'Live football scores right now',
    execute: async (sock, message, args, context) => {
      const { chatId } = context;
      const fake = createFakeContact(message);
      try {
        const matches = await getLiveMatches();
        if (!matches.length) throw new Error('No matches found');

        const live = matches.filter(m => m.state === 1);
        const finished = matches.filter(m => m.state === -1);
        const upcoming = matches.filter(m => m.state === 0);

        const fields = [];
        if (live.length) {
          live.slice(0, 15).forEach(m => {
            fields.push([`${m.homeName} ${m.homeScore ?? 0} - ${m.awayScore ?? 0} ${m.awayName}`, m.leagueEn]);
          });
        } else if (finished.length) {
          finished.slice(0, 10).forEach(m => {
            fields.push([`${m.homeName} ${m.homeScore ?? 0} - ${m.awayScore ?? 0} ${m.awayName}`, m.leagueEn]);
          });
        } else if (upcoming.length) {
          upcoming.slice(0, 10).forEach(m => {
            const matchTime = new Date(m.matchTime_t).toLocaleString();
            fields.push([`${m.homeName} vs ${m.awayName}`, `${m.leagueEn} — ${matchTime}`]);
          });
        }

        if (!fields.length) fields.push(['Result', 'No matches available']);

        const label = live.length ? 'Live Now' : finished.length ? 'Recent Results' : 'Upcoming';
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: `Football — ${label}`, fields }),
          ...replyOpts()
        }, { quoted: fake });
      } catch (err) {
        return sock.sendMessage(chatId, { text: buildHint(err.message) }, { quoted: fake });
      }
    }
  }
];
