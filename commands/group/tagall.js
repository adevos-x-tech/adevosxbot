const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const isAdmin = require('../../AdevosAuth/isAdmin');

module.exports = [
  {
    name: 'tagall',
    aliases: ['mentionall', 'everyone'],
    category: 'group',
    description: 'Mention all group members, visibly listed — works in-group or with an id from anywhere',
    usage: '.tagall [message] | .tagall <group-id> [message]',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const inGroup = chatId.endsWith('@g.us');

      let rest = [...args];
      let targetId = inGroup ? chatId : null;
      if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) targetId = rest.shift();

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .tagall <group-id> [message]', 'Or run it inside a group') }, { quoted: fake });
      }

      const perms = targetId === chatId
        ? { isSenderAdmin, isBotAdmin }
        : await isAdmin(sock, targetId, senderId).catch(() => ({ isSenderAdmin: false, isBotAdmin: false }));

      if (!perms.isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        const allParticipants = meta.participants || [];
        const admins  = allParticipants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const members = allParticipants.filter(p => !p.admin);
        const allJids = allParticipants.map(p => p.id);
        const customMsg = rest.join(' ') || 'Attention everyone!';

        const fields = [];
        if (admins.length) fields.push(['Admins', admins.map(a => `@${a.id.split('@')[0]}`).join(' ')]);
        if (members.length) fields.push(['Members', members.map(m => `@${m.id.split('@')[0]}`).join(' ')]);

        await sock.sendMessage(targetId, {
          text: buildFrame({ title: `${botName} — Tag All`, fields: [['Note', customMsg], ...fields] }),
          mentions: allJids,
        }, { ...replyOpts() });

        if (targetId !== chatId) {
          await sock.sendMessage(chatId, { text: buildHint(`Tagged everyone in ${meta.subject || 'the group'}`) }, { quoted: fake });
        }
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
