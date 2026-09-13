const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'setownername',
    aliases: ['ownername'],
    category: 'owner',
    description: 'Change the owner name',
    usage: '.setownername <name>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const newName = args.join(' ').trim();
      if (!newName) return sock.sendMessage(chatId, { text: buildHint('Provide a name', '.setownername <name>') }, { quoted: fake });

      updateSetting('botOwner', newName);
      global.botOwner = newName;
      return sock.sendMessage(chatId, { text: buildHint('Owner name changed to', newName) }, { quoted: fake, ...replyOpts() });
    }
  }
];
