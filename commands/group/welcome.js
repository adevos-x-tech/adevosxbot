const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, setWelcome, removeWelcome } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'welcome',
    category: 'group',
    description: 'Set/toggle the welcome message',
    usage: '.welcome <on|off|set <message>|reset>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();
      const prefix = getSetting('prefix', '.');

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Welcome Settings',
            commands: [
              `${prefix}welcome on — Enable`,
              `${prefix}welcome off — Disable`,
              `${prefix}welcome set <msg> — Custom`,
              `${prefix}welcome reset — Use default`,
            ],
            fields: [['Variables', '{user} {group} {description} {time} {members} {bot}']],
          })
        }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        removeWelcome(chatId);
        return sock.sendMessage(chatId, { text: buildHint('Welcome disabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'on' || sub === 'reset') {
        setWelcome(chatId, null);
        return sock.sendMessage(chatId, { text: buildHint('Welcome enabled', 'Using default template') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const customMsg = args.slice(1).join(' ');
        if (!customMsg) {
          return sock.sendMessage(chatId, { text: buildHint('Provide a message', `e.g: ${prefix}welcome set @{user} Welcome!`) }, { quoted: fake });
        }
        setWelcome(chatId, customMsg);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Welcome Enabled', fields: [['Preview', customMsg.substring(0, 100) + (customMsg.length > 100 ? '...' : '')]] })
        }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Use: on / off / set / reset') }, { quoted: fake });
    }
  }
];
