const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const DEFAULT_BOT_NAME = 'Adevos-X Bot';

module.exports = [
  {
    name: 'setbotname',
    aliases: ['botname'],
    category: 'owner',
    description: 'Change the bot name',
    usage: '.setbotname <name> | .setbotname reset',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const fake = createFakeContact(message);
      const botName = getBotName();

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] })
        }, { quoted: fake });
      }

      const applyName = async (name) => {
        updateSetting('botName', name);
        global.botName = name;
        return sock.sendMessage(chatId, {
          text: buildHint('Bot name changed to', name)
        }, { quoted: fake, ...replyOpts() });
      };

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'reset') {
        return applyName(DEFAULT_BOT_NAME);
      }

      if (args.length) {
        const newName = args.join(' ').trim();
        return applyName(newName);
      }

      // No args → show current name with numbered quick-actions
      const sent = await sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Bot Name',
          fields: [['Current', botName]],
          commands: [
            'setbotname reset',
            'setbotname <name>',
          ],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });

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
          const leadNum = (text.match(/^\d+/) || [])[0];
          if (leadNum === '1') return applyName(DEFAULT_BOT_NAME);
          if (text.startsWith('2')) {
            const name = text.slice(1).trim();
            if (name) return applyName(name);
            return sock.sendMessage(chatId, { text: buildHint('Reply with: 2 <name>', '2 Ad Bot') }, { quoted: fake });
          }
        });
        setTimeout(() => global.replyHandlers?.delete(handlerKey), 120000);
      }
    }
  }
];
