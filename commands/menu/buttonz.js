'use strict';

const { getSetting } = require('../../AdevosAuth/database');
const { sendList } = require('../../Adevoslib/interactive');

module.exports = {
  name: 'buttonz',
  aliases: ['btn'],
  category: 'menu',
  description: 'Display a selectable command list',
  execute: async (sock, message, args, context) => {
    const prefix = getSetting('prefix', '.');
    const rows = [
      { title: 'Menu', description: 'Show all bot commands', id: `${prefix}menu` },
      { title: 'Ping', description: 'Check bot response time', id: `${prefix}ping` },
      { title: 'Alive', description: 'Confirm the bot is running', id: `${prefix}alive` },
      { title: 'Settings', description: 'Show bot settings', id: `${prefix}menuinfo` },
    ];
    return sendList(sock, context.chatId, {
      text: 'Pick a command to run:',
      footer: 'Adevos X Bot',
      buttonText: 'Open Menu',
      sections: [{ title: 'Bot Commands', rows }],
      prefix,
      quoted: context.fake,
    });
  },
};
