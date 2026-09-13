const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendWithCopy } = require('../../Adevoslib/interactive');
const isAdmin = require('../../AdevosAuth/isAdmin');

module.exports = [
  {
    name: 'linkgroup',
    aliases: ['grouplink', 'invitelink', 'link'],
    category: 'group',
    description: 'Get the group invite link — works in-group or with an id',
    usage: '.linkgroup | .linkgroup <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const inGroup = chatId.endsWith('@g.us');

      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : inGroup ? chatId
        : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .linkgroup <group-id>', 'Or run it inside a group with no arguments') }, { quoted: fake });
      }

      const perms = targetId === chatId
        ? { isSenderAdmin, isBotAdmin }
        : await isAdmin(sock, targetId, senderId).catch(() => ({ isSenderAdmin: false, isBotAdmin: false }));

      if (!perms.isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin to get the group link']] }) }, { quoted: fake });
      }
      if (!perms.isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      try {
        const [code, meta] = await Promise.all([
          sock.groupInviteCode(targetId),
          sock.groupMetadata(targetId),
        ]);
        const link = `https://chat.whatsapp.com/${code}`;
        const text = buildFrame({
          title: 'Group Invite Link',
          fields: [
            ['Group', meta.subject],
            ['Members', String(meta.participants.length)],
            ['Link', link],
          ],
        });

        await sendWithCopy(sock, chatId, {
          text,
          copyText: link,
          buttonLabel: 'Copy Link',
          quoted: fake,
        });
      } catch (e) {
        const errText = (e.message?.includes('not-authorized') || e.message?.includes('forbidden'))
          ? 'I need admin to get the link'
          : `Failed: ${e.message}`;
        await sock.sendMessage(chatId, { text: buildHint(errText) }, { quoted: fake });
      }
    }
  }
];
