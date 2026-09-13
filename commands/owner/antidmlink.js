const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'antidmlink',
    aliases: ['dmantilink', 'antispamdm'],
    category: 'owner',
    description: 'Automatically block untrusted links sent to the bot in DM',
    usage: '.antidmlink on/off',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      const cur = getSetting('antidmlink', false);

      if (sub === 'on') {
        updateSetting('antidmlink', true);
        return sock.sendMessage(chatId, { text: buildHint('DM Antilink enabled', 'Untrusted links sent to the bot in DM will be auto-blocked') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        updateSetting('antidmlink', false);
        return sock.sendMessage(chatId, { text: buildHint('DM Antilink disabled') }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'DM Antilink', fields: [['Status', cur ? 'On' : 'Off']], commands: ['antidmlink on', 'antidmlink off'] })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
