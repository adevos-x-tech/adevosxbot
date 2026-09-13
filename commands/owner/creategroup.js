const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'creategroup',
    aliases: ['newgroup', 'makegroup'],
    category: 'owner',
    description: 'Create a new WhatsApp group — name required, description optional',
    usage: '.creategroup <name> | <description>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const raw = args.join(' ').trim();
      if (!raw) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .creategroup <name> | <description>', 'The description is optional') }, { quoted: fake });
      }

      const [name, description] = raw.split('|').map(s => s.trim());
      if (!name) {
        return sock.sendMessage(chatId, { text: buildHint('Provide a group name') }, { quoted: fake });
      }

      try {
        const senderNum = senderId.split('@')[0].split(':')[0];
        const participants = senderNum ? [`${senderNum}@s.whatsapp.net`] : [];
        const group = await sock.groupCreate(name, participants);

        if (description) {
          await sock.groupUpdateDescription(group.id, description).catch(() => {});
        }

        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Group Created', fields: [['Name', name], ['ID', group.id.split('@')[0]], description ? ['Description', description] : ['Description', '(none)']] })
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
