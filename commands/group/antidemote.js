const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const VALID_MODES = ['kick', 'revert', 'notify'];

function getCfg(chatId) {
  return getChatData(chatId, 'antidemote', { enabled: false, mode: 'revert', maxWarnings: 3 });
}
function saveCfg(chatId, cfg) {
  updateChatData(chatId, 'antidemote', cfg);
}

module.exports = [
  {
    name: 'antidemote',
    category: 'group',
    description: 'Block members from demoting other admins',
    usage: '.antidemote on/off | .antidemote set kick/revert/notify',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const cfg = getCfg(chatId);
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'on') {
        cfg.enabled = true; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antidemote turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antidemote turned OFF') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const mode = (args[1] || '').toLowerCase();
        if (!VALID_MODES.includes(mode)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antidemote set kick/revert/notify') }, { quoted: fake });
        }
        cfg.mode = mode; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antidemote action set to ${mode}`) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antidemote',
          fields: [
            ['Current', cfg.enabled ? 'On' : 'Off'],
            ['Action', cfg.mode || 'revert'],
          ],
          commands: ['antidemote on/off', 'antidemote set kick', 'antidemote set revert', 'antidemote set notify'],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
