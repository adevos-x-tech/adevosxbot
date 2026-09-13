const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autostatusreply',
    aliases: ['autoreplystatus', 'statusreply', 'statusautoreply', 'replyonstatus'],
    category: 'owner',
    description: 'Auto-reply to status updates with a custom message',
    usage: '.autostatusreply on/off/set <text>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const sub = (args[0] || '').toLowerCase();

      const raw = getSetting('autostatusConfig', null);
      const cfg = (raw && typeof raw === 'object') ? { ...raw } : {};

      if (!sub) {
        const on = cfg.replyOn !== undefined ? cfg.replyOn : false;
        const txt = cfg.replyText || 'Seen your status!';
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Auto Status Reply', fields: [['Status', on ? 'On' : 'Off'], ['Reply', txt]], commands: ['autostatusreply on', 'autostatusreply off', 'autostatusreply set <text>'] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'on') {
        cfg.replyOn = true;
        updateSetting('autostatusConfig', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Auto Status Reply enabled', `Reply text: ${cfg.replyText || 'Seen your status!'}`) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.replyOn = false;
        updateSetting('autostatusConfig', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Auto Status Reply disabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const text = args.slice(1).join(' ').trim();
        if (!text) return sock.sendMessage(chatId, { text: buildHint('Provide a reply text', '.autostatusreply set Seen your status!') }, { quoted: fake });
        cfg.replyText = text;
        updateSetting('autostatusConfig', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Status reply text set', text) }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Unknown option. Use: on / off / set <text>') }, { quoted: fake });
    }
  }
];
