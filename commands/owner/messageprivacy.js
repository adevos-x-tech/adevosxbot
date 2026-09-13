'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","contacts","contact_blacklist","none"];

module.exports = {
  name: 'messageprivacy',
  aliases: ["msgprivacy"],
  category: 'owner',
  description: 'Set message privacy privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateMessagesPrivacy(value);
        return context.reply('MESSAGE PRIVACY: ' + value);
      } catch (error) {
        return context.reply('Could not update message privacy: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can message you?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'MESSAGE PRIVACY',
        rows: [
            { title: 'all', description: 'Set messageprivacy to all', id: `${prefix}messageprivacy all` },
            { title: 'contacts', description: 'Set messageprivacy to contacts', id: `${prefix}messageprivacy contacts` },
            { title: 'contact_blacklist', description: 'Set messageprivacy to contact_blacklist', id: `${prefix}messageprivacy contact_blacklist` },
            { title: 'none', description: 'Set messageprivacy to none', id: `${prefix}messageprivacy none` },
        ],
      }],
    });
  },
};
