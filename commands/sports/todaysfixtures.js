'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const FD_KEY = '7b6507c792f74a2b9db41cfc8fd8cf05';
const FD_URL = 'https://api.football-data.org/v4/competitions';

const fetchFD = async (endpoint) => {
  const res = await axios.get(`${FD_URL}/${endpoint}`, {
    headers: { 'X-Auth-Token': FD_KEY },
    timeout: 12000,
  });
  return res.data;
};

const formatDate = (ds) => {
  const d = new Date(ds);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

module.exports = [
{
    name: 'todaysfixtures',
    aliases: ['today', 'todaymatches', 'fixtures'],
    category: 'sports',
    description: "Today's fixtures across top 5 leagues",
    execute: async (sock, message, args, context) => {
      const { chatId } = context;
      const fake = createFakeContact(message);
      try {
        const today = new Date().toISOString().split('T')[0];
        const [epl, ll, bl, sa, l1] = await Promise.all([
          fetchFD(`PL/matches?dateFrom=${today}&dateTo=${today}`).catch(() => null),
          fetchFD(`PD/matches?dateFrom=${today}&dateTo=${today}`).catch(() => null),
          fetchFD(`BL1/matches?dateFrom=${today}&dateTo=${today}`).catch(() => null),
          fetchFD(`SA/matches?dateFrom=${today}&dateTo=${today}`).catch(() => null),
          fetchFD(`FL1/matches?dateFrom=${today}&dateTo=${today}`).catch(() => null),
        ]);

        const fields = [];
        const add = (data, name) => {
          if (!data?.matches?.length) return;
          data.matches.slice(0, 5).forEach(m => {
            const live = m.status === 'IN_PLAY' ? ' (LIVE)' : '';
            fields.push([`${name}: ${m.homeTeam.name} vs ${m.awayTeam.name}`, `${formatDate(m.utcDate)}${live}`]);
          });
        };
        add(epl, 'Premier League');
        add(ll, 'LaLiga');
        add(bl, 'Bundesliga');
        add(sa, 'Serie A');
        add(l1, 'Ligue 1');

        if (!fields.length) fields.push(['Result', 'No fixtures today across the top 5 leagues']);

        return sock.sendMessage(chatId, {
          text: buildFrame({ title: "Today's Fixtures", fields }),
          ...replyOpts()
        }, { quoted: fake });
      } catch (err) {
        return sock.sendMessage(chatId, { text: buildHint(err.message) }, { quoted: fake });
      }
    }
  }
];
