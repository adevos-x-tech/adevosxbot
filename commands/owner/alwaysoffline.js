const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'alwaysoffline',
    aliases: ['alwaysinvisible'],
    category: 'owner',
    description: 'Keep the bot always appearing offline',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      const current = getSetting('alwaysoffline', false);

      if (!sub) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Always Offline', fields: [['Status', current ? 'On' : 'Off']], commands: ['alwaysoffline on', 'alwaysoffline off'] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'on') {
        updateSetting('alwaysoffline', true);
        updateSetting('alwaysonline', false);
        await sock.sendPresenceUpdate('unavailable').catch(() => {});
        return sock.sendMessage(chatId, { text: buildHint('Always Offline enabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        updateSetting('alwaysoffline', false);
        return sock.sendMessage(chatId, { text: buildHint('Always Offline disabled') }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Use: on / off') }, { quoted: fake });
    }
  }
];
