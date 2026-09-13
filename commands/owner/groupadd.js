'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","contacts","contact_blacklist","none"];

module.exports = {
  name: 'groupadd',
  aliases: ["groupprivacy"],
  category: 'owner',
  description: 'Set group add privacy privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateGroupsAddPrivacy(value);
        return context.reply('GROUP ADD PRIVACY: ' + value);
      } catch (error) {
        return context.reply('Could not update group add privacy: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can add you to groups?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'GROUP ADD PRIVACY',
        rows: [
            { title: 'all', description: 'Set groupadd to all', id: `${prefix}groupadd all` },
            { title: 'contacts', description: 'Set groupadd to contacts', id: `${prefix}groupadd contacts` },
            { title: 'contact_blacklist', description: 'Set groupadd to contact_blacklist', id: `${prefix}groupadd contact_blacklist` },
            { title: 'none', description: 'Set groupadd to none', id: `${prefix}groupadd none` },
        ],
      }],
    });
  },
};
