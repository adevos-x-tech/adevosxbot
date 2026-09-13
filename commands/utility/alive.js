const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');
const os = require('os');

module.exports = [
{
    name: 'alive',
    aliases: ['botinfo'],
    category: 'utility',
    description: 'Check if bot is alive',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const totalSeconds = process.uptime();
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      const usedMem = ((process.memoryUsage().rss) / 1024 / 1024).toFixed(1);
      const prefix = global.prefix || getSetting('prefix', '.');
      const totalCmds = global.commands?.size || 0;

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: getBotName(),
          fields: [
            ['Status', 'Active'],
            ['Uptime', uptimeStr],
            ['Version', global.version || '3.0.0'],
            ['Prefix', prefix],
            ['Commands', String(totalCmds)],
            ['RAM', `${usedMem} MB`],
            ['Node', process.version],
            ['Platform', `${os.platform()}/${os.arch()}`],
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
