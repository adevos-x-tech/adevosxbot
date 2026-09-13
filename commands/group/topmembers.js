const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { getGroupMessageCounts } = require('../../Adevoslib/messageStats');

module.exports = [
  {
    name: 'getparticipants',
    aliases: ['topmembers', 'top', 'leaderboard'],
    category: 'group',
    description: 'Show the most active members by message count, since the bot joined',
    usage: '.getparticipants | .getparticipants <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : chatId.endsWith('@g.us') ? chatId : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .getparticipants <group-id>', 'Or run it inside a group') }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        const counts = getGroupMessageCounts(targetId);
        const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10);

        if (!sorted.length) {
          return sock.sendMessage(chatId, { text: buildHint('No message activity tracked yet') }, { quoted: fake });
        }

        const fields = sorted.map(([uid, count], i) => [String(i + 1), `@${uid.split('@')[0].split(':')[0]} — ${count} msgs`]);
        const text = buildFrame({ title: `${meta.subject} — Top Active`, fields });

        let pfpUrl = null;
        try { pfpUrl = await sock.profilePictureUrl(targetId, 'image'); } catch (_) {}

        const mentions = sorted.map(([uid]) => uid);
        if (pfpUrl) {
          await sock.sendMessage(chatId, { image: { url: pfpUrl }, caption: text, mentions, ...replyOpts() }, { quoted: fake });
        } else {
          await sock.sendMessage(chatId, { text, mentions, ...replyOpts() }, { quoted: fake });
        }
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
