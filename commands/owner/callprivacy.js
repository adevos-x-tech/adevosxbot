'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","known","none"];

module.exports = {
  name: 'callprivacy',
  aliases: ["callpriv"],
  category: 'owner',
  description: 'Set call privacy privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateCallPrivacy(value);
        return context.reply('CALL PRIVACY: ' + value);
      } catch (error) {
        return context.reply('Could not update call privacy: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can call you?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'CALL PRIVACY',
        rows: [
            { title: 'all', description: 'Set callprivacy to all', id: `${prefix}callprivacy all` },
            { title: 'known', description: 'Set callprivacy to known', id: `${prefix}callprivacy known` },
            { title: 'none', description: 'Set callprivacy to none', id: `${prefix}callprivacy none` },
        ],
      }],
    });
  },
};
