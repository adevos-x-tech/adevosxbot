const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'setprefix',
    aliases: ['prefix'],
    category: 'owner',
    description: 'Change the bot prefix',
    usage: '.setprefix <char> | .setprefix none',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] })
        }, { quoted: fake });
      }

      let newPrefix = args[0];
      if (!newPrefix) {
        return sock.sendMessage(chatId, {
          text: buildHint('Usage: .setprefix <char>', 'Use "none" to remove the prefix — .setprefix none')
        }, { quoted: fake });
      }
      if (newPrefix.length > 5 && newPrefix.toLowerCase() !== 'none') {
        return sock.sendMessage(chatId, {
          text: buildHint('Prefix too long (max 5 chars)', 'Or use .setprefix none to disable it')
        }, { quoted: fake });
      }
      if (newPrefix.toLowerCase() === 'none') newPrefix = '';

      updateSetting('prefix', newPrefix);
      global.prefix = newPrefix;
      const displayPrefix = newPrefix || '(none — commands run without a prefix)';
      return sock.sendMessage(chatId, {
        text: buildHint('Prefix changed to', displayPrefix)
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
