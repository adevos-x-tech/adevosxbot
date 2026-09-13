const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'antileave',
    aliases: ['antileft'],
    category: 'group',
    description: 'Automatically re-add members who leave the group on their own',
    usage: '.antileave on/off',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }
      if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin to re-add members']] }) }, { quoted: fake });
      }

      const cfg = getChatData(chatId, 'antileave', { enabled: false });
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'on') {
        cfg.enabled = true; updateChatData(chatId, 'antileave', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antileave turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; updateChatData(chatId, 'antileave', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antileave turned OFF') }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Antileave', fields: [['Current', cfg.enabled ? 'On' : 'Off']], commands: ['antileave on', 'antileave off'] })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
