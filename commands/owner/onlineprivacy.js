'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","match_last_seen"];

module.exports = {
  name: 'onlineprivacy',
  aliases: ["onlinepriv"],
  category: 'owner',
  description: 'Set online privacy privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateOnlinePrivacy(value);
        return context.reply('ONLINE PRIVACY: ' + value);
      } catch (error) {
        return context.reply('Could not update online privacy: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can see when you are online?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'ONLINE PRIVACY',
        rows: [
            { title: 'all', description: 'Set onlineprivacy to all', id: `${prefix}onlineprivacy all` },
            { title: 'match_last_seen', description: 'Set onlineprivacy to match_last_seen', id: `${prefix}onlineprivacy match_last_seen` },
        ],
      }],
    });
  },
};
