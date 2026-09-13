const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'join',
    category: 'owner',
    description: 'Join a group via invite link',
    usage: '.join <group invite link>  or  reply to a link with .join',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      let link = args.join(' ').trim();
      if (!link) {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        link = (quoted?.conversation || quoted?.extendedTextMessage?.text || '').trim();
      }

      const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
      if (!match) {
        return sock.sendMessage(chatId, { text: buildHint('Provide a valid group invite link', '.join https://chat.whatsapp.com/xxxxx') }, { quoted: fake });
      }

      try {
        const result = await sock.groupAcceptInvite(match[1]);
        const meta = await sock.groupMetadata(result).catch(() => null);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Joined Group', fields: [['Group', meta?.subject || 'Unknown'], ['ID', result.split('@')[0]]] })
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        let msg = e.message;
        if (msg.includes('gone') || msg.includes('not-authorized')) msg = 'Invalid or expired invite link';
        return sock.sendMessage(chatId, { text: buildHint(`Failed to join: ${msg}`) }, { quoted: fake });
      }
    }
  }
];
