'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","contacts","contact_blacklist","none"];

module.exports = {
  name: 'lastseen',
  aliases: ["lastseenprivacy"],
  category: 'owner',
  description: 'Set last seen privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateLastSeenPrivacy(value);
        return context.reply('LAST SEEN: ' + value);
      } catch (error) {
        return context.reply('Could not update last seen: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can see your last seen?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'LAST SEEN',
        rows: [
            { title: 'all', description: 'Set lastseen to all', id: `${prefix}lastseen all` },
            { title: 'contacts', description: 'Set lastseen to contacts', id: `${prefix}lastseen contacts` },
            { title: 'contact_blacklist', description: 'Set lastseen to contact_blacklist', id: `${prefix}lastseen contact_blacklist` },
            { title: 'none', description: 'Set lastseen to none', id: `${prefix}lastseen none` },
        ],
      }],
    });
  },
};
