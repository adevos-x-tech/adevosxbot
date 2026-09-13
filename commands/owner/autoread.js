const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autoread',
    category: 'owner',
    description: 'Toggle auto-read messages',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') { updateSetting('autoread', true); return sock.sendMessage(chatId, { text: buildHint('Auto-Read enabled') }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'off') { updateSetting('autoread', false); return sock.sendMessage(chatId, { text: buildHint('Auto-Read disabled') }, { quoted: fake, ...replyOpts() }); }
      const cur = getSetting('autoread', false);
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Auto-Read', fields: [['Status', cur ? 'On' : 'Off']], commands: ['autoread on', 'autoread off'] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
