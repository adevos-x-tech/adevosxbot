const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { addBan } = require('../../AdevosAuth/isBanned');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'ban',
    category: 'owner',
    description: 'Ban a user from using the bot',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or provide a number') }, { quoted: fake });

      for (const m of targets) addBan(m);
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Banned', fields: [['User(s)', targets.map(m => `@${m.split('@')[0]}`).join(', ')]] }),
        mentions: targets,
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
