const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { addSudo } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'addsudo',
    aliases: ['sudo'],
    category: 'owner',
    description: 'Add a sudo user',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) {
        return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or provide a number', '.addsudo 254784517274') }, { quoted: fake });
      }

      for (const m of targets) addSudo(m);
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Sudo Added', fields: [['User(s)', targets.map(m => `@${m.split('@')[0]}`).join(', ')]] }),
        mentions: targets,
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
