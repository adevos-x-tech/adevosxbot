const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');
const os = require('os');

module.exports = [
{
    name: 'uptime',
    aliases: ['runtime', 'stats', 'up'],
    category: 'utility',
    description: 'Show detailed bot uptime and system stats',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const totalSeconds = process.uptime();
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      const mem = process.memoryUsage();
      const usedRss = (mem.rss / 1024 / 1024).toFixed(1);
      const usedHeap = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const totalHeap = (mem.heapTotal / 1024 / 1024).toFixed(1);
      const cpuLoad = os.loadavg()[0].toFixed(2);
      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
      const prefix = global.prefix || getSetting('prefix', '.');
      const mode = getSetting('mode', 'public');
      const totalCmds = global.commands?.size || 0;

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: `${getBotName()} Stats`,
          fields: [
            ['Uptime', uptimeStr],
            ['Version', global.version || '3.0.0'],
            ['Prefix', prefix],
            ['Mode', String(mode).toUpperCase()],
            ['Commands', String(totalCmds)],
            ['RAM (RSS)', `${usedRss} MB`],
            ['Heap', `${usedHeap}/${totalHeap} MB`],
            ['System RAM', `${freeMem}/${totalMem} MB free`],
            ['CPU load', `${cpuLoad}%`],
            ['Node', process.version],
            ['Platform', `${os.platform()}/${os.arch()}`],
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
