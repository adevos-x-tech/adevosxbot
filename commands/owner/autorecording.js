const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autorecording',
    aliases: ['autorecord', 'recording'],
    category: 'owner',
    description: 'Show recording indicator when receiving messages',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const chatId = message.key.remoteJid;
      const senderId = message.key.participant || message.key.remoteJid;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const { stopAllIntervals } = require('../../Adevoslib/autorecording');
      const cfg = getSetting('autorecording', { enabled: false, pm: false, group: false });
      const sub = (args[0] || '').toLowerCase();
      const sub2 = (args[1] || '').toLowerCase();

      if (!sub) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Auto Recording',
            fields: [['Status', cfg.enabled ? 'On' : 'Off'], ['PM', cfg.pm ? 'On' : 'Off'], ['Group', cfg.group ? 'On' : 'Off']],
            commands: ['autorecording on/off/both', 'autorecording pm on/off', 'autorecording group on/off'],
          })
        }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'on' || sub === 'both') {
        updateSetting('autorecording', { ...cfg, enabled: true, pm: true, group: true });
        return sock.sendMessage(chatId, { text: buildHint(`Auto Recording ${sub === 'both' ? 'enabled (both)' : 'enabled'}`) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        stopAllIntervals();
        updateSetting('autorecording', { ...cfg, enabled: false, pm: false, group: false });
        return sock.sendMessage(chatId, { text: buildHint('Auto Recording disabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'pm') {
        if (sub2 === 'on') { const n = { ...cfg, enabled: true, pm: true }; updateSetting('autorecording', n); return sock.sendMessage(chatId, { text: buildHint('Auto Recording PM enabled') }, { quoted: fake, ...replyOpts() }); }
        if (sub2 === 'off') { const n = { ...cfg, pm: false }; if (!n.group) n.enabled = false; updateSetting('autorecording', n); return sock.sendMessage(chatId, { text: buildHint('Auto Recording PM disabled') }, { quoted: fake, ...replyOpts() }); }
        const n = { ...cfg, enabled: true, pm: !cfg.pm }; updateSetting('autorecording', n);
        return sock.sendMessage(chatId, { text: buildHint(`Auto Recording PM: ${n.pm ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'group') {
        if (sub2 === 'on') { const n = { ...cfg, enabled: true, group: true }; updateSetting('autorecording', n); return sock.sendMessage(chatId, { text: buildHint('Auto Recording Group enabled') }, { quoted: fake, ...replyOpts() }); }
        if (sub2 === 'off') { const n = { ...cfg, group: false }; if (!n.pm) n.enabled = false; updateSetting('autorecording', n); return sock.sendMessage(chatId, { text: buildHint('Auto Recording Group disabled') }, { quoted: fake, ...replyOpts() }); }
        const n = { ...cfg, enabled: true, group: !cfg.group }; updateSetting('autorecording', n);
        return sock.sendMessage(chatId, { text: buildHint(`Auto Recording Group: ${n.group ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Use: on/off/both/pm/group') }, { quoted: fake });
    }
  }
];
