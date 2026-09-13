const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, setGoodbye, removeGoodbye } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'goodbye',
    aliases: ['bye'],
    category: 'group',
    description: 'Set/toggle the goodbye message',
    usage: '.goodbye <on|off|set <message>|reset>',
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
            title: 'Goodbye Settings',
            commands: [
              `${prefix}goodbye on — Enable`,
              `${prefix}goodbye off — Disable`,
              `${prefix}goodbye set <msg> — Custom`,
              `${prefix}goodbye reset — Use default`,
            ],
            fields: [['Variables', '{user} {group} {time} {bot}']],
          })
        }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        removeGoodbye(chatId);
        return sock.sendMessage(chatId, { text: buildHint('Goodbye disabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'on' || sub === 'reset') {
        setGoodbye(chatId, null);
        return sock.sendMessage(chatId, { text: buildHint('Goodbye enabled', 'Using default template') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const customMsg = args.slice(1).join(' ');
        if (!customMsg) {
          return sock.sendMessage(chatId, { text: buildHint('Provide a message', `e.g: ${prefix}goodbye set @{user} Goodbye!`) }, { quoted: fake });
        }
        setGoodbye(chatId, customMsg);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Goodbye Enabled', fields: [['Preview', customMsg.substring(0, 100) + (customMsg.length > 100 ? '...' : '')]] })
        }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Use: on / off / set / reset') }, { quoted: fake });
    }
  }
];
