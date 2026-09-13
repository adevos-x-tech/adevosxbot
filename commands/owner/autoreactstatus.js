const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autoreactstatus',
    aliases: ['autostatusreact', 'autolikestatus'],
    category: 'owner',
    description: 'Toggle auto-reacting to WhatsApp statuses',
    usage: '.autoreactstatus on/off',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();

      if (sub !== 'on' && sub !== 'off') {
        const raw = getSetting('autostatusConfig', null);
        const cfg = (raw && typeof raw === 'object') ? raw : {};
        const cur = cfg.reactOn !== undefined ? cfg.reactOn : false;
        const emoji = cfg.reactionEmoji || '❤';
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Auto React Status', fields: [['Status', cur ? 'On' : 'Off'], ['Emoji', emoji]], commands: ['autoreactstatus on', 'autoreactstatus off'] })
        }, { quoted: fake, ...replyOpts() });
      }

      const raw = getSetting('autostatusConfig', null);
      const cfg = (raw && typeof raw === 'object') ? { ...raw } : {};
      cfg.reactOn = sub === 'on';
      updateSetting('autostatusConfig', cfg);
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Auto React Status', fields: [['Status', cfg.reactOn ? 'On' : 'Off']] })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
