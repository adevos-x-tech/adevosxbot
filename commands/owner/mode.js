const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendButtonV2 } = require('../../Adevoslib/interactive');

module.exports = [
{
    name: 'mode',
    aliases: ['botmode', 'setbotmode'],
    category: 'owner',
    description: 'Set bot mode (public/private/group/dm)',
    usage: '.mode <public|private|group|dm>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      // Accept "private mode" phrasing too, per spec
      let firstArg = (args[0] || '').toLowerCase();
      if (firstArg === 'private' && (args[1] || '').toLowerCase() === 'mode') firstArg = 'private';

      const newMode = firstArg;
      if (!['public', 'private', 'group', 'dm'].includes(newMode)) {
        const cur = getSetting('mode', 'public');
        return sendButtonV2(sock, chatId, {
          body: buildFrame({ title: 'Bot Mode', fields: [['Current', cur.toUpperCase()]] }),
          footer: getBotName(),
          buttons: [
            { text: 'Public', id: `${getSetting('prefix', '.')}mode public` },
            { text: 'Private', id: `${getSetting('prefix', '.')}mode private` },
            { text: 'Group only', id: `${getSetting('prefix', '.')}mode group` },
            { text: 'DM only', id: `${getSetting('prefix', '.')}mode dm` },
          ],
          quoted: fake,
          userJid: sock.user?.id || '',
        });
      }

      updateSetting('mode', newMode);
      global.mode = newMode;
      return sock.sendMessage(chatId, { text: buildHint(`Mode set to ${newMode.toUpperCase()}`) }, { quoted: fake, ...replyOpts() });
    }
  },
  {
    name: 'private',
    category: 'owner',
    description: 'Shortcut for .mode private',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const fake = createFakeContact(message);
      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: getBotName(), fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      updateSetting('mode', 'private');
      global.mode = 'private';
      return sock.sendMessage(chatId, { text: buildHint('Mode set to PRIVATE') }, { quoted: fake, ...replyOpts() });
    }
  }
];
