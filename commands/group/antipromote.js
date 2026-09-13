const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const VALID_MODES = ['kick', 'revert', 'notify'];

function getCfg(chatId) {
  return getChatData(chatId, 'antipromote', { enabled: false, mode: 'revert', maxWarnings: 3 });
}
function saveCfg(chatId, cfg) {
  updateChatData(chatId, 'antipromote', cfg);
}

module.exports = [
  {
    name: 'antipromote',
    category: 'group',
    description: 'Block members from promoting others to admin',
    usage: '.antipromote on/off | .antipromote set kick/revert/notify',
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
        return sock.sendMessage(chatId, { text: buildHint('Antipromote turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antipromote turned OFF') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const mode = (args[1] || '').toLowerCase();
        if (!VALID_MODES.includes(mode)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antipromote set kick/revert/notify') }, { quoted: fake });
        }
        cfg.mode = mode; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antipromote action set to ${mode}`) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antipromote',
          fields: [
            ['Current', cfg.enabled ? 'On' : 'Off'],
            ['Action', cfg.mode || 'revert'],
          ],
          commands: ['antipromote on/off', 'antipromote set kick', 'antipromote set revert', 'antipromote set notify'],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
