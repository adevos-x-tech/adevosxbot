const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const VALID_ACTIONS = ['warn', 'kick'];

module.exports = [
  {
    name: 'antigroupcall',
    aliases: ['blockgroupcall'],
    category: 'group',
    description: 'Block group voice/video calls, with warn or kick action against the caller',
    usage: '.antigroupcall on/off | .antigroupcall set warn/kick',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const cfg = getChatData(chatId, 'antigroupcall', { enabled: false, action: 'warn', maxWarnings: 3 });
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'on') {
        cfg.enabled = true; updateChatData(chatId, 'antigroupcall', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antigroupcall turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; updateChatData(chatId, 'antigroupcall', cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antigroupcall turned OFF') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antigroupcall set warn/kick') }, { quoted: fake });
        }
        cfg.action = action; updateChatData(chatId, 'antigroupcall', cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antigroupcall action set to ${action}`) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antigroupcall',
          fields: [['Current', cfg.enabled ? 'On' : 'Off'], ['Action', cfg.action || 'warn']],
          commands: ['antigroupcall on/off', 'antigroupcall set warn', 'antigroupcall set kick'],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
