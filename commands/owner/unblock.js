const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'unblock',
    category: 'owner',
    description: 'Unblock a contact',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const { targets } = resolveTargets(message, args);
      if (!targets.length) return sock.sendMessage(chatId, { text: buildHint('Mention someone or provide a number') }, { quoted: fake });

      for (const t of targets) {
        try { await sock.updateBlockStatus(t, 'unblock'); } catch (_) {}
      }
      const nums = targets.map(t => `+${t.split('@')[0]}`).join(', ');
      return sock.sendMessage(chatId, { text: buildHint(`Unblocked: ${nums}`) }, { quoted: fake, ...replyOpts() });
    }
  }
];
