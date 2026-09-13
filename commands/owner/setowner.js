const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'setowner',
    aliases: ['addowner', 'regowner'],
    category: 'owner',
    description: "Register owner phone number (run from bot's own device or linked session)",
    usage: '.setowner <number>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const isFromDevice = message.key.fromMe;

      if (!isFromDevice && !senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildHint("This command can only be run from the bot's own session", "Open WhatsApp from the bot's number and type .setowner <num>")
        }, { quoted: fake });
      }

      const numRaw = (args[0] || '').replace(/\D/g, '').trim();
      if (!numRaw || numRaw.length < 7) {
        const cur = getSetting('ownerNumber', '');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Set Owner', fields: [['Current owner', cur || 'Not set']], commands: ['setowner <number>'] })
        }, { quoted: fake, ...replyOpts() });
      }

      updateSetting('ownerNumber', numRaw);
      global.ownerNumber = numRaw;
      return sock.sendMessage(chatId, {
        text: buildHint(`Owner set to +${numRaw}`, 'This number now has full owner access to the bot')
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
