'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","contacts","contact_blacklist","none"];

module.exports = {
  name: 'mystatus',
  aliases: ["statusprivacy"],
  category: 'owner',
  description: 'Set status privacy privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateStatusPrivacy(value);
        return context.reply('STATUS PRIVACY: ' + value);
      } catch (error) {
        return context.reply('Could not update status privacy: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can see your status?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'STATUS PRIVACY',
        rows: [
            { title: 'all', description: 'Set mystatus to all', id: `${prefix}mystatus all` },
            { title: 'contacts', description: 'Set mystatus to contacts', id: `${prefix}mystatus contacts` },
            { title: 'contact_blacklist', description: 'Set mystatus to contact_blacklist', id: `${prefix}mystatus contact_blacklist` },
            { title: 'none', description: 'Set mystatus to none', id: `${prefix}mystatus none` },
        ],
      }],
    });
  },
};
