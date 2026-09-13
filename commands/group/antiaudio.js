const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const VALID_ACTIONS = ['delete', 'warn', 'kick'];

function getCfg(chatId) {
  return getChatData(chatId, 'antiaudio', { enabled: false, action: 'delete', maxWarnings: 3 });
}
function saveCfg(chatId, cfg) {
  updateChatData(chatId, 'antiaudio', cfg);
}

module.exports = [
  {
    name: 'antiaudio',
    category: 'group',
    description: 'Auto-moderate audios shared in the group',
    usage: '.antiaudio on/off | .antiaudio set warn/kick/delete',
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
        return sock.sendMessage(chatId, { text: buildHint('Antiaudio turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antiaudio turned OFF') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antiaudio set warn/kick/delete') }, { quoted: fake });
        }
        cfg.action = action; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antiaudio action set to ${action}`) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antiaudio',
          fields: [
            ['Current', cfg.enabled ? 'On' : 'Off'],
            ['Action', cfg.action || 'delete'],
          ],
          commands: ['antiaudio on/off', 'antiaudio set warn/kick/delete'],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
