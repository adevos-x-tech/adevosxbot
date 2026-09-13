const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autotyping',
    aliases: ['autotyoing', 'typing'],
    category: 'owner',
    description: 'Show typing indicator when receiving messages',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const chatId = message.key.remoteJid;
      const senderId = message.key.participant || message.key.remoteJid;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const { stopAllIntervals } = require('../../Adevoslib/autotyping');
      const cfg = getSetting('autotyping', { enabled: false, pm: false, group: false });
      const sub = (args[0] || '').toLowerCase();
      const sub2 = (args[1] || '').toLowerCase();

      if (!sub) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Auto Typing',
            fields: [['Status', cfg.enabled ? 'On' : 'Off'], ['PM', cfg.pm ? 'On' : 'Off'], ['Group', cfg.group ? 'On' : 'Off']],
            commands: ['autotyping on/off/both', 'autotyping pm on/off', 'autotyping group on/off'],
          })
        }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'on' || sub === 'both') {
        updateSetting('autotyping', { ...cfg, enabled: true, pm: true, group: true });
        return sock.sendMessage(chatId, { text: buildHint(`Auto Typing ${sub === 'both' ? 'enabled (both)' : 'enabled'}`) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        stopAllIntervals();
        updateSetting('autotyping', { ...cfg, enabled: false, pm: false, group: false });
        return sock.sendMessage(chatId, { text: buildHint('Auto Typing disabled') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'pm') {
        if (sub2 === 'on') { const n = { ...cfg, enabled: true, pm: true }; updateSetting('autotyping', n); return sock.sendMessage(chatId, { text: buildHint('Auto Typing PM enabled') }, { quoted: fake, ...replyOpts() }); }
        if (sub2 === 'off') { const n = { ...cfg, pm: false }; if (!n.group) n.enabled = false; updateSetting('autotyping', n); return sock.sendMessage(chatId, { text: buildHint('Auto Typing PM disabled') }, { quoted: fake, ...replyOpts() }); }
        const n = { ...cfg, enabled: true, pm: !cfg.pm }; updateSetting('autotyping', n);
        return sock.sendMessage(chatId, { text: buildHint(`Auto Typing PM: ${n.pm ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'group') {
        if (sub2 === 'on') { const n = { ...cfg, enabled: true, group: true }; updateSetting('autotyping', n); return sock.sendMessage(chatId, { text: buildHint('Auto Typing Group enabled') }, { quoted: fake, ...replyOpts() }); }
        if (sub2 === 'off') { const n = { ...cfg, group: false }; if (!n.pm) n.enabled = false; updateSetting('autotyping', n); return sock.sendMessage(chatId, { text: buildHint('Auto Typing Group disabled') }, { quoted: fake, ...replyOpts() }); }
        const n = { ...cfg, enabled: true, group: !cfg.group }; updateSetting('autotyping', n);
        return sock.sendMessage(chatId, { text: buildHint(`Auto Typing Group: ${n.group ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Use: on/off/both/pm/group') }, { quoted: fake });
    }
  }
];
