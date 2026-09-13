const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'anticall',
    aliases: ['blockcall'],
    category: 'owner',
    description: 'Block/decline incoming private calls',
    usage: '.anticall on/off/block/decline/both/msg <text>/status',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const sub = (args[0] || '').toLowerCase();
      const cfg = getSetting('anticall', { enabled: false, mode: 'decline', message: 'Calls are not allowed!', allowed: [] });

      if (sub === 'add' || sub === 'remove' || sub === 'clear') {
        const updated = { ...cfg, allowed: cfg.allowed || [] };
        if (sub === 'clear') {
          updated.allowed = [];
          updateSetting('anticall', updated);
          return sock.sendMessage(chatId, { text: buildHint('Allowed callers list cleared') }, { quoted: fake, ...replyOpts() });
        }
        const num = (args[1] || '').replace(/\D/g, '');
        if (!num) return sock.sendMessage(chatId, { text: buildHint(`Usage: .anticall ${sub} <number>`) }, { quoted: fake });
        if (sub === 'add') {
          updated.allowed = [...new Set([...updated.allowed, num])];
          updateSetting('anticall', updated);
          return sock.sendMessage(chatId, { text: buildHint(`+${num} added to allowed callers`) }, { quoted: fake, ...replyOpts() });
        }
        updated.allowed = updated.allowed.filter(n => n !== num);
        updateSetting('anticall', updated);
        return sock.sendMessage(chatId, { text: buildHint(`+${num} removed from allowed callers`) }, { quoted: fake, ...replyOpts() });
      }

      if (!sub || sub === 'status') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Anti-Call',
            fields: [
              ['Status', cfg.enabled ? 'On' : 'Off'],
              ['Mode', (cfg.mode || 'decline').toUpperCase()],
              ['Message', cfg.message || 'Calls not allowed!'],
              ['Allowed callers', (cfg.allowed || []).length ? cfg.allowed.map(n => `+${n}`).join(', ') : 'None'],
            ],
            commands: ['anticall on/off', 'anticall block', 'anticall decline', 'anticall both', 'anticall msg <text>', 'anticall add <number>', 'anticall remove <number>', 'anticall clear'],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      const updated = { ...cfg };
      let reply = '';

      if (sub === 'on') { updated.enabled = true; reply = `Anti-Call enabled — mode: ${updated.mode || 'decline'}`; }
      else if (sub === 'off') { updated.enabled = false; reply = 'Anti-Call disabled'; }
      else if (sub === 'block') { updated.enabled = true; updated.mode = 'block'; reply = 'Mode set to BLOCK — callers will be blocked'; }
      else if (sub === 'decline') { updated.enabled = true; updated.mode = 'decline'; reply = 'Mode set to DECLINE'; }
      else if (sub === 'both') { updated.enabled = true; updated.mode = 'both'; reply = 'Mode set to BOTH — declined and blocked'; }
      else if (sub === 'msg' || sub === 'message') {
        const txt = args.slice(1).join(' ').trim();
        if (!txt) return sock.sendMessage(chatId, { text: buildHint('Provide a message') }, { quoted: fake });
        updated.message = txt; reply = `Call message set to: "${txt}"`;
      }
      else { return sock.sendMessage(chatId, { text: buildHint('Unknown option', 'Use: on/off/block/decline/both/msg') }, { quoted: fake }); }

      updateSetting('anticall', updated);
      return sock.sendMessage(chatId, { text: buildHint(reply) }, { quoted: fake, ...replyOpts() });
    }
  }
];
