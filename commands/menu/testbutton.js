'use strict';

const { sendButtonV2 } = require('../../Adevoslib/interactive');
const { getSetting } = require('../../AdevosAuth/database');

module.exports = {
  name: 'testbutton',
  aliases: ['tb'],
  category: 'menu',
  description: 'Test three quick command buttons',
  execute: async (sock, message, args, context) => {
    const prefix = getSetting('prefix', '.');
    return sendButtonV2(sock, context.chatId, {
      body: 'Choose an action:',
      footer: 'Adevos X Bot',
      buttons: [
        { text: 'Menu', id: `${prefix}menu` },
        { text: 'Ping', id: `${prefix}ping` },
        { text: 'Alive', id: `${prefix}alive` },
      ],
      quoted: context.fake,
      userJid: sock.user?.id || '',
    });
  },
};
