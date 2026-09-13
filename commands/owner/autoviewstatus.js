const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autoviewstatus',
    aliases: ['autostatusview'],
    category: 'owner',
    description: 'Toggle auto-viewing of WhatsApp statuses',
    usage: '.autoviewstatus on/off',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();

      if (sub !== 'on' && sub !== 'off') {
        const raw = getSetting('autostatusConfig', null);
        const cfg = (raw && typeof raw === 'object') ? raw : {};
        const cur = cfg.viewOn !== undefined ? cfg.viewOn : true;
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Auto View Status', fields: [['Status', cur ? 'On' : 'Off']], commands: ['autoviewstatus on', 'autoviewstatus off'] })
        }, { quoted: fake, ...replyOpts() });
      }

      const raw = getSetting('autostatusConfig', null);
      const cfg = (raw && typeof raw === 'object') ? { ...raw } : {};
      cfg.viewOn = sub === 'on';
      updateSetting('autostatusConfig', cfg);
      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'Auto View Status', fields: [['Status', cfg.viewOn ? 'On' : 'Off']] })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
