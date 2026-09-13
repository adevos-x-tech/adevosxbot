const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'settimezone',
    aliases: ['stz', 'timezone'],
    category: 'owner',
    description: 'Set bot timezone',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      if (!args[0]) {
        const cur = getSetting('timezone', 'Africa/Nairobi');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Timezone', fields: [['Current', cur]], commands: ['settimezone Africa/Lagos'] })
        }, { quoted: fake, ...replyOpts() });
      }

      updateSetting('timezone', args[0]);
      return sock.sendMessage(chatId, { text: buildHint(`Timezone set to ${args[0]}`) }, { quoted: fake, ...replyOpts() });
    }
  }
];
