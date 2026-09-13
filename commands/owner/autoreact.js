const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'autoreact',
    aliases: ['areact', 'msgreact'],
    category: 'owner',
    description: 'Auto-react to incoming messages with emojis (not WA statuses)',
    usage: '.autoreact <on|off|group|dm|both|emojis <list>>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      const modeLabel = { off: 'Off', dm: 'DM only', group: 'Groups only', both: 'Both', on: 'Both' };

      if (!sub) {
        const cur = String(getSetting('autoreact', 'off'));
        const emojis = getSetting('reactionEmojis', ['✅', '❤', '👍', '🔥', '💯', '🌟']);
        const emojiList = Array.isArray(emojis) ? emojis.join(' ') : emojis;
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Auto-React (messages)',
            fields: [
              ['Mode', modeLabel[cur] || cur],
              ['Emojis', emojiList],
              ['Note', 'Reacts to messages, not statuses (see .autostatus). Owner messages are never reacted to.'],
            ],
            commands: ['autoreact on — DM + groups', 'autoreact off', 'autoreact group', 'autoreact dm', 'autoreact emojis ❤ 🔥 😂'],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'emojis' || sub === 'emoji') {
        const list = args.slice(1).filter(a => a.trim());
        if (!list.length) return sock.sendMessage(chatId, { text: buildHint('Provide emojis', '.autoreact emojis ❤ 🔥 😂') }, { quoted: fake });
        updateSetting('reactionEmojis', list);
        return sock.sendMessage(chatId, { text: buildHint(`Reaction emojis set: ${list.join(' ')}`) }, { quoted: fake, ...replyOpts() });
      }

      const modeMap = { on: 'both', both: 'both', all: 'both', off: 'off', group: 'group', gc: 'group', dm: 'dm', private: 'dm', pm: 'dm' };
      const newMode = modeMap[sub];
      if (!newMode) return sock.sendMessage(chatId, { text: buildHint('Usage: .autoreact <on|off|group|dm|both>') }, { quoted: fake });

      updateSetting('autoreact', newMode);
      return sock.sendMessage(chatId, { text: buildHint(`Auto-React (messages): ${modeLabel[newMode] || newMode}`) }, { quoted: fake, ...replyOpts() });
    }
  }
];
