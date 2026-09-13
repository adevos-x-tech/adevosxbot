'use strict';

const { getSetting } = require('../../AdevosAuth/database');
const { sendList } = require('../../Adevoslib/interactive');
const isAdmin = require('../../AdevosAuth/isAdmin');

const DURATIONS = {
  off: 0,
  '24h': 86400,
  '7d': 604800,
  '90d': 7776000,
};

module.exports = {
  name: 'disappearing',
  aliases: ['ephemeral', 'disp'],
  category: 'group',
  description: 'Set disappearing-message duration for this chat or DM',
  usage: '.disp <off|24h|7d|90d> | .disp <group-id> <off|24h|7d|90d>',
  execute: async (sock, message, args, context) => {
    const { chatId, senderId, senderIsSudo } = context;
    const inGroup = chatId.endsWith('@g.us');

    let rest = [...args];
    let targetId = chatId;
    if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) targetId = rest.shift();

    if (targetId.endsWith('@g.us')) {
      const perms = targetId === chatId
        ? { isSenderAdmin: context.isSenderAdmin, isBotAdmin: context.isBotAdmin }
        : await isAdmin(sock, targetId, senderId).catch(() => ({}));
      if (!perms.isSenderAdmin && !senderIsSudo) return context.reply('Admins only.');
      if (!perms.isBotAdmin) return context.reply('I need admin in that group.');
    } else if (!senderIsSudo && targetId !== senderId) {
      return context.reply('You can only set this for your own DM.');
    }

    const prefix = getSetting('prefix', '.');
    const value = String(rest[0] || '').toLowerCase();

    if (!value) {
      return sendList(sock, chatId, {
        text: 'Choose the disappearing-message duration:',
        footer: 'Adevos X Bot',
        buttonText: 'Select Duration',
        prefix,
        quoted: context.fake,
        sections: [{
          title: 'Duration',
          rows: [
            { title: 'Off', description: 'Disable disappearing messages', id: `${prefix}disp off` },
            { title: '24 Hours', description: 'Messages expire after one day', id: `${prefix}disp 24h` },
            { title: '7 Days', description: 'Messages expire after one week', id: `${prefix}disp 7d` },
            { title: '90 Days', description: 'Messages expire after ninety days', id: `${prefix}disp 90d` },
          ],
        }],
      });
    }

    if (!(value in DURATIONS)) return context.reply('Use the list or choose: off, 24h, 7d, or 90d.');
    try {
      if (targetId.endsWith('@g.us')) {
        await sock.groupToggleEphemeral(targetId, DURATIONS[value]);
      } else {
        await sock.sendMessage(targetId, { disappearingMessagesInChat: DURATIONS[value] });
      }
      return context.reply(value === 'off' ? 'Disappearing messages disabled.' : `Disappearing messages set to ${value}.`);
    } catch (error) {
      return context.reply(`Could not update disappearing messages: ${error.message}`);
    }
  },
};
