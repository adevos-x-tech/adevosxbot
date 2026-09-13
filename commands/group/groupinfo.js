const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendWithCopy } = require('../../Adevoslib/interactive');

module.exports = [
  {
    name: 'groupinfo',
    aliases: ['ginfo', 'gcinfo'],
    category: 'group',
    description: 'Get information about a group — works in-group or with an id, from anywhere',
    usage: '.groupinfo | .groupinfo <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : chatId.endsWith('@g.us') ? chatId
        : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .groupinfo <group-id>', 'Or run it inside a group with no arguments') }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        const admins = meta.participants.filter(p => p.admin);
        const creator = meta.owner || meta.subjectOwner || (meta.participants.find(p => p.admin === 'superadmin')?.id) || 'Unknown';

        const fields = [
          ['Name', meta.subject],
          ['ID', targetId.split('@')[0]],
          ['Members', String(meta.participants.length)],
          ['Admins', String(admins.length)],
          ['Creator', creator.includes('@') ? `@${creator.split('@')[0]}` : creator],
          ['Created', new Date(meta.creation * 1000).toLocaleDateString()],
        ];
        if (meta.desc) fields.push(['Description', meta.desc]);

        const text = buildFrame({ title: 'Group Info', fields });
        const mentions = creator.includes('@') ? [creator] : [];

        await sendWithCopy(sock, chatId, {
          text,
          copyText: targetId.split('@')[0],
          buttonLabel: 'Copy ID',
          quoted: fake,
          mentions,
        });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Could not fetch group info: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
