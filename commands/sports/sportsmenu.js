'use strict';

const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'sportsmenu',
    aliases: ['sportshelp', 'footballmenu'],
    category: 'sports',
    description: 'Show all sports commands',
    execute: async (sock, message, args, context) => {
      const { chatId } = context;
      const fake = createFakeContact(message);
      const p = global.prefix || '.';

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: `${getBotName()} Sports`,
          fields: [
            ['Live Scores', `${p}livescore`],
            ['Standings', `${p}epl, ${p}bundesliga, ${p}laliga, ${p}seriea, ${p}ligue1`],
            ['Fixtures', `${p}todaysfixtures`],
          ],
        }),
        ...replyOpts()
      }, { quoted: fake });
    }
  }
];
