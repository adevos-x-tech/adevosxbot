const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const VALID_ACTIONS = ['delete', 'warn', 'kick'];

function getCfg(chatId) {
  return getChatData(chatId, 'antigroupmention', { enabled: false, action: 'delete', maxWarnings: 3 });
}
function saveCfg(chatId, cfg) {
  updateChatData(chatId, 'antigroupmention', cfg);
}

module.exports = [
  {
    name: 'antigroupmention',
    aliases: ['antistatusmention'],
    category: 'group',
    description: 'Block members from tagging this group in their WhatsApp status',
    usage: '.antigroupmention on/off | .antigroupmention set warn/kick/delete',
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
        return sock.sendMessage(chatId, { text: buildHint('Antigroupmention turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antigroupmention turned OFF') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antigroupmention set warn/kick/delete') }, { quoted: fake });
        }
        cfg.action = action; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antigroupmention action set to ${action}`) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antigroupmention',
          fields: [
            ['Current', cfg.enabled ? 'On' : 'Off'],
            ['Action', cfg.action || 'delete'],
          ],
          commands: ['antigroupmention on/off', 'antigroupmention set warn/kick/delete'],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
