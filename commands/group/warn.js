const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');
const { addWarning, getWarnLimit } = require('../../Adevoslib/warnings');

module.exports = [
  {
    name: 'warn',
    category: 'group',
    description: 'Warn a member by mention, number, or reply',
    usage: '.warn @user [reason] | .warn 255... [reason] | reply .warn [reason]',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }
      if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin to enforce warnings']] }) }, { quoted: fake });
      }

      const { targets, remainingArgs } = resolveTargets(message, args);
      if (!targets.length) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Warn', fields: [['Usage', 'Mention, reply, or provide a number']], commands: ['warn @user [reason]', 'warn 255... [reason]'] })
        }, { quoted: fake });
      }

      const target = targets[0];
      const reason = remainingArgs.join(' ').trim() || 'No reason given';
      const customMsg = getChatData(chatId, 'warnMessage', null);

      const { count, limit, kicked } = addWarning(chatId, target, reason);
      const tag = `@${target.split('@')[0]}`;

      const bodyFields = [
        ['Warned', tag],
        ['Reason', reason],
        ['Warnings', `${count}/${limit}`],
      ];
      if (customMsg) bodyFields.push(['Note', customMsg]);

      await sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Warning Issued', fields: bodyFields }),
        mentions: [target],
      }, { quoted: fake, ...replyOpts() });

      if (kicked) {
        await sock.groupParticipantsUpdate(chatId, [target], 'remove').catch(() => {});
        await sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Warn Limit Reached', fields: [[tag, `Removed after ${limit} warnings`]] }),
          mentions: [target],
        }, { quoted: fake, ...replyOpts() });
      }
    }
  },
  {
    name: 'setwarnmessage',
    aliases: ['warnmessage'],
    category: 'group',
    description: 'Customize the note shown alongside warnings, or reset it',
    usage: '.setwarnmessage <text> | .setwarnmessage reset',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const fake = createFakeContact(message);
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: getBotName(), fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }
      if (!args.length || args[0].toLowerCase() === 'reset') {
        updateChatData(chatId, 'warnMessage', null);
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Warn Message', fields: [['Status', 'Reset to default']] }) }, { quoted: fake, ...replyOpts() });
      }
      const text = args.join(' ').trim();
      updateChatData(chatId, 'warnMessage', text);
      return sock.sendMessage(chatId, { text: buildFrame({ title: 'Warn Message', fields: [['Set to', text]] }) }, { quoted: fake, ...replyOpts() });
    }
  }
];
