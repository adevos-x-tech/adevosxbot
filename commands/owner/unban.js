const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { removeBan } = require('../../AdevosAuth/isBanned');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'unban',
    category: 'owner',
    description: 'Unban a user',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or provide a number') }, { quoted: fake });

      for (const m of targets) removeBan(m);
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Unbanned', fields: [['User(s)', targets.map(m => `@${m.split('@')[0]}`).join(', ')]] }),
        mentions: targets,
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
