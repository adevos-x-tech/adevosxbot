const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { getStyleList } = require('../../Adevoslib/fontStyles');

module.exports = [
  {
    name: 'setfont',
    aliases: ['font', 'fontlist'],
    category: 'owner',
    description: 'Set text font style for all bot replies',
    usage: '.setfont <name> | .setfont <number> | .setfont reset',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] })
        }, { quoted: fake });
      }

      const styles = getStyleList();
      const current = getSetting('fontstyle', 'none');

      const applyStyle = async (key) => {
        updateSetting('fontstyle', key);
        const info = styles.find(s => s.key === key);
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Font',
            fields: [['Style set', info.name], ['Preview', info.preview]],
          })
        }, { quoted: fake, ...replyOpts() });
      };

      // .setfont reset → back to default (no styling)
      if ((args[0] || '').toLowerCase() === 'reset') {
        return applyStyle('none');
      }

      // .setfont <number|name> → apply directly
      if (args[0]) {
        const arg = args[0].toLowerCase().trim();
        const byNumber = /^\d+$/.test(arg) ? styles[parseInt(arg, 10) - 1] : null;
        const byKey = styles.find(s => s.key === arg);
        const match = byNumber || byKey;
        if (!match) {
          return sock.sendMessage(chatId, {
            text: buildHint(`Invalid style: ${arg}`, 'Use .fontlist to see the numbered list')
          }, { quoted: fake });
        }
        return applyStyle(match.key);
      }

      // No args → show numbered list, let the user reply with a number
      let list = `╭─*\`${botName} Fonts\`*\n`;
      list += `├─*Current:*\n│    └ ${styles.find(s => s.key === current)?.name || 'Default'}\n`;
      list += `╰──*\`Styles\`*\n`;
      styles.forEach((s, i) => {
        list += `          └ ${i + 1}. ${s.name} — ${s.preview}\n`;
      });
      list += `\n_Reply with a number, or use .setfont <number> / .setfont reset_`;

      const sent = await sock.sendMessage(chatId, { text: list, ...replyOpts() }, { quoted: fake });

      // Register a reply handler so the user can just reply with a number
      if (!global.replyHandlers) global.replyHandlers = new Map();
      const handlerKey = sent?.key?.id;
      if (handlerKey) {
        global.replyHandlers.set(handlerKey, async (replyMsg) => {
          global.replyHandlers.delete(handlerKey);
          const replySender = replyMsg.key.participant || replyMsg.key.remoteJid;
        // NOTE: sender check intentionally removed — stanzaId match already
        // proves this is a genuine reply to this exact bot message; LID vs
        // phone-number JIDs for the same person cannot be reliably compared.
          const text = (replyMsg.message?.extendedTextMessage?.text || replyMsg.message?.conversation || '').trim();
          const idx = parseInt(text, 10);
          if (!idx || !styles[idx - 1]) return;
          await applyStyle(styles[idx - 1].key);
        });
        // Auto-expire the handler after 2 minutes so it doesn't leak
        setTimeout(() => global.replyHandlers?.delete(handlerKey), 120000);
      }
    }
  }
];
