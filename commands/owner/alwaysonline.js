const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'alwaysonline',
    aliases: ['alwaysavailable'],
    category: 'owner',
    description: 'Toggle always-online presence',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      const current = getSetting('alwaysonline', false);

      if (!sub) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Always Online', fields: [['Status', current ? 'On' : 'Off']], commands: ['alwaysonline on', 'alwaysonline off'] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'on') {
        updateSetting('alwaysonline', true);
        await sock.sendPresenceUpdate('available').catch(() => {});
        return sock.sendMessage(chatId, { text: buildHint('Always Online enabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        updateSetting('alwaysonline', false);
        return sock.sendMessage(chatId, { text: buildHint('Always Online disabled') }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Use: on / off') }, { quoted: fake });
    }
  }
];
