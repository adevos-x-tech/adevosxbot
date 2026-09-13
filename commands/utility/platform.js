const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');
const os = require('os');

function detectPlatform() {
  if (process.env.HEROKU_APP_NAME || process.env.DYNO) return 'Heroku';
  if (process.env.RAILWAY_ENVIRONMENT) return 'Railway';
  if (process.env.RENDER) return 'Render';
  if (process.env.KOYEB_APP_NAME) return 'Koyeb';
  if (process.env.REPL_ID) return 'Replit';
  if (process.env.FLY_APP_NAME) return 'Fly.io';
  if (process.env.PTERODACTYL_SERVER_UUID || process.env.SERVER_UUID) return 'Pterodactyl VPS';
  return getSetting('platform', 'VPS/Local');
}

module.exports = [
{
    name: 'platform',
    aliases: ['host', 'hostinginfo'],
    category: 'utility',
    description: 'Show which platform the bot is deployed on',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: `${getBotName()} Platform`,
          fields: [
            ['Platform', detectPlatform()],
            ['OS', `${os.type()} ${os.release()}`],
            ['Arch', os.arch()],
            ['CPUs', String(os.cpus().length)],
            ['Node', process.version],
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
