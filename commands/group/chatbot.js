const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting, getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'chatbot',
    aliases: ['aichat', 'bot'],
    category: 'group',
    description: 'Toggle AI chatbot — per-group and globally',
    usage: '.chatbot <on|off|group|dm|both|status>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isGroup } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();
      const prefix = getSetting('prefix', '.');

      const globalMode = String(getSetting('chatbot', 'off')).toLowerCase();
      const modeLabel = { off: 'Off', dm: 'DM only', group: 'Groups only', both: 'Both', on: 'Both' };

      // Status view (no sub or 'status')
      if (!sub || sub === 'status') {
        const fields = [['Global mode', modeLabel[globalMode] || globalMode]];
        if (isGroup) {
          const pg = getChatData(chatId, 'chatbot', false);
          const pgOn = pg === true || pg === 'true' || pg === 1;
          fields.push(['This group', pgOn ? 'On' : 'Off']);
        }
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Chatbot Status',
            fields,
            commands: [
              `${prefix}chatbot on/off`,
              `${prefix}chatbot group — groups only`,
              `${prefix}chatbot dm — DMs only`,
              `${prefix}chatbot both — everywhere`,
            ],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      // Per-group enable/disable — admin or sudo
      if (isGroup && (sub === 'on' || sub === 'off' || sub === 'enable' || sub === 'disable')) {
        if (!isSenderAdmin && !senderIsSudo) {
          return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
        }
        const enable = sub === 'on' || sub === 'enable';
        updateChatData(chatId, 'chatbot', enable);
        if (enable && (globalMode === 'off' || globalMode === 'dm')) {
          updateSetting('chatbot', 'group');
        }
        return sock.sendMessage(chatId, {
          text: buildHint(enable ? 'Chatbot ON for this group' : 'Chatbot OFF for this group', enable ? 'Tag me or reply to my messages to chat' : undefined)
        }, { quoted: fake, ...replyOpts() });
      }

      // Global mode — owner/sudo only
      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only for global settings']] }) }, { quoted: fake });
      }

      if (sub === 'off') {
        updateSetting('chatbot', 'off');
        return sock.sendMessage(chatId, { text: buildHint('Chatbot disabled globally') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'group') {
        updateSetting('chatbot', 'group');
        return sock.sendMessage(chatId, { text: buildHint('Chatbot mode: GROUPS', 'Replies in enabled groups when tagged/replied to') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'dm' || sub === 'private' || sub === 'pm') {
        updateSetting('chatbot', 'dm');
        return sock.sendMessage(chatId, { text: buildHint('Chatbot mode: DM', 'Replies to all DM texts') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'both' || sub === 'on' || sub === 'all') {
        updateSetting('chatbot', 'both');
        return sock.sendMessage(chatId, { text: buildHint('Chatbot mode: BOTH', 'DMs + tagged in enabled groups') }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, { text: buildHint(`Usage: ${prefix}chatbot <on|off|group|dm|both|status>`) }, { quoted: fake });
    }
  }
];
