const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

// Detection/capture logic lives in ./events.js (storeMessage,
// handleMessageRevocation, handleMessagesDelete, handleMessageEdit) —
// this file is only the .antiedit toggle command, reading/writing the
// same 'antiedit' setting that events.js checks.

module.exports = [
{
    name: 'antiedit',
    aliases: ['antiedits'],
    category: 'owner',
    description: 'Catch edited messages and forward originals to your DM',
    usage: '.antiedit on/off/private/groups/all/status',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase().trim();

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const cur = String(getSetting('antiedit', 'off') || 'off').toLowerCase();
      const label = m => ({ off: 'Off', private: 'DMs only', groups: 'Groups only', all: 'All chats' }[m] || m.toUpperCase());

      if (!sub || sub === 'status') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Anti-Edit',
            fields: [
              ['Status', label(cur)],
              ['Note', 'Edited messages are forwarded to owner DM'],
            ],
            commandsLabel: 'Commands',
            commands: [
              'antiedit on — all chats',
              'antiedit private — DMs only',
              'antiedit groups — groups only',
              'antiedit all — all chats',
              'antiedit off — disable',
            ],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      let next = null;
      if (sub === 'on' || sub === 'all')      next = 'all';
      else if (sub === 'private' || sub === 'pm' || sub === 'dm') next = 'private';
      else if (sub === 'groups' || sub === 'group' || sub === 'gc') next = 'groups';
      else if (sub === 'off')                 next = 'off';

      if (!next) {
        return sock.sendMessage(chatId, { text: buildHint('Use: on / off / private / groups / all / status') }, { quoted: fake });
      }

      updateSetting('antiedit', next);
      return sock.sendMessage(chatId, {
        text: next === 'off'
          ? buildHint('Anti-Edit disabled')
          : buildFrame({ title: 'Anti-Edit', fields: [['Status', 'On'], ['Scope', label(next)], ['Note', 'Edited messages are forwarded to owner DM with old and new text']] })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
