const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { formatDuration } = require('../../Adevoslib/myfunc');
const { getSetting } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'status',
    aliases: ['botstatus'],
    category: 'utility',
    description: 'Show bot status overview',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const db = global.db || {};
      const uptime = formatDuration(Date.now() - (db.stats?.startTime || Date.now()));
      const prefix = global.prefix || getSetting('prefix', '.');
      const mode = getSetting('mode', 'public');
      const totalCmds = global.commands?.size || 0;
      const totalGroups = (await sock.groupFetchAllParticipating().catch(() => ({})));

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: `${getBotName()} Status`,
          fields: [
            ['Status', 'Online'],
            ['Uptime', uptime],
            ['Prefix', prefix],
            ['Mode', String(mode).toUpperCase()],
            ['Commands', String(totalCmds)],
            ['Groups', String(Object.keys(totalGroups || {}).length)],
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
