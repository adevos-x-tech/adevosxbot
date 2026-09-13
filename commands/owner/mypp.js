'use strict';

const { sendList } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

const OPTIONS = ["all","contacts","contact_blacklist","none"];

module.exports = {
  name: 'mypp',
  aliases: ["profileprivacy"],
  category: 'owner',
  description: 'Set profile picture privacy',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    if (!context.senderIsSudo) return context.reply('Owner only.');
    const prefix = getSetting('prefix', '.');
    const value = String(args[0] || '').toLowerCase();

    if (OPTIONS.includes(value)) {
      try {
        await sock.updateProfilePicturePrivacy(value);
        return context.reply('PROFILE PICTURE: ' + value);
      } catch (error) {
        return context.reply('Could not update profile picture: ' + error.message);
      }
    }

    return sendList(sock, context.chatId, {
      text: 'Who can see your profile picture?',
      footer: 'Adevos X Bot',
      buttonText: 'Select Option',
      prefix,
      quoted: context.fake,
      sections: [{
        title: 'PROFILE PICTURE',
        rows: [
            { title: 'all', description: 'Set mypp to all', id: `${prefix}mypp all` },
            { title: 'contacts', description: 'Set mypp to contacts', id: `${prefix}mypp contacts` },
            { title: 'contact_blacklist', description: 'Set mypp to contact_blacklist', id: `${prefix}mypp contact_blacklist` },
            { title: 'none', description: 'Set mypp to none', id: `${prefix}mypp none` },
        ],
      }],
    });
  },
};
