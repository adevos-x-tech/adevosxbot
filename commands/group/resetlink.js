const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendWithCopy } = require('../../Adevoslib/interactive');

module.exports = [
{
    name: 'resetlink',
    aliases: ['revokelink', 'newlink'],
    category: 'group',
    description: 'Reset (revoke) the group invite link and show the new one',
    usage: '.resetlink',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      if (!isBotAdmin) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin to reset the link']] }) }, { quoted: fake });

      try {
        const newCode = await sock.groupRevokeInvite(chatId);
        const meta = await sock.groupMetadata(chatId).catch(() => ({}));
        const newLink = `https://chat.whatsapp.com/${newCode}`;
        return sendWithCopy(sock, chatId, {
          text: buildFrame({ title: 'Link Reset', fields: [['Group', meta.subject || 'Group'], ['New link', newLink]] }),
          copyText: newLink,
          buttonLabel: 'Copy Link',
          quoted: fake,
        });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed to reset link: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
