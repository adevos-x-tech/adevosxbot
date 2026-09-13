const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const VALID_ACTIONS = ['delete', 'warn', 'kick'];

function getCfg(chatId) {
  return getChatData(chatId, 'antibadword', { enabled: false, action: 'delete', maxWarnings: 3, words: [] });
}
function saveCfg(chatId, cfg) {
  updateChatData(chatId, 'antibadword', cfg);
}

module.exports = [
  {
    name: 'antibadword',
    aliases: ['badword'],
    category: 'group',
    description: 'Auto-moderate bad words in the group',
    usage: '.antibadword on/off | .antibadword set warn/kick/delete | .antibadword add <word> | .antibadword remove <word> | .antibadword list',
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
        return sock.sendMessage(chatId, { text: buildHint('Antibadword turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antibadword turned OFF') }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antibadword set warn/kick/delete') }, { quoted: fake });
        }
        cfg.action = action; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antibadword action set to ${action}`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'add') {
        const word = args.slice(1).join(' ').trim().toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: buildHint('Usage: .antibadword add <word>') }, { quoted: fake });
        cfg.words = [...new Set([...(cfg.words || []), word])];
        saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Added "${word}" to the bad word list`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'remove') {
        const word = args.slice(1).join(' ').trim().toLowerCase();
        cfg.words = (cfg.words || []).filter(w => w !== word);
        saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Removed "${word}" from the bad word list`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'list') {
        const words = cfg.words || [];
        if (!words.length) return sock.sendMessage(chatId, { text: buildHint('No custom bad words added (built-in defaults still apply)') }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Custom Bad Words', fields: words.map((w, i) => [String(i + 1), w]) })
        }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antibadword',
          fields: [
            ['Current', cfg.enabled ? 'On' : 'Off'],
            ['Action', cfg.action || 'delete'],
            ['Custom words', String((cfg.words || []).length)],
          ],
          commands: [
            'antibadword on/off',
            'antibadword set warn/kick/delete',
            'antibadword add <word>',
            'antibadword remove <word>',
            'antibadword list',
          ],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
