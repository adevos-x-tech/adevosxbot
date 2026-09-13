const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
{
    name: 'block',
    category: 'owner',
    description: 'Block a contact, or manage auto-block of unknown DM senders',
    usage: '.block @user | .block unknown on/off',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      if ((args[0] || '').toLowerCase() === 'unknown') {
        const sub2 = (args[1] || '').toLowerCase();
        const cur = getSetting('autoBlockUnknown', false);
        if (sub2 === 'on') { updateSetting('autoBlockUnknown', true); return sock.sendMessage(chatId, { text: buildHint('Auto-block unknown/unsaved DM numbers: ON') }, { quoted: fake, ...replyOpts() }); }
        if (sub2 === 'off') { updateSetting('autoBlockUnknown', false); return sock.sendMessage(chatId, { text: buildHint('Auto-block unknown/unsaved DM numbers: OFF') }, { quoted: fake, ...replyOpts() }); }
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Auto-Block Unknown', fields: [['Status', cur ? 'On' : 'Off']], commands: ['block unknown on', 'block unknown off'] }) }, { quoted: fake, ...replyOpts() });
      }

      const { targets } = resolveTargets(message, args);
      if (!targets.length) return sock.sendMessage(chatId, { text: buildHint('Mention, reply, or provide a number to block', 'Or: .block unknown on/off') }, { quoted: fake });

      for (const t of targets) {
        try { await sock.updateBlockStatus(t, 'block'); } catch (_) {}
      }
      const nums = targets.map(t => `+${t.split('@')[0]}`).join(', ');
      return sock.sendMessage(chatId, { text: buildHint(`Blocked: ${nums}`) }, { quoted: fake, ...replyOpts() });
    }
  }
];
