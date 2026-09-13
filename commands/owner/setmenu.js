const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const MENU_STYLES = {
  '1': 'Plain text (full list, read more)',
  '2': 'Categories + picture (reply to browse)',
  '3': 'Categories only (reply to browse)',
  '4': 'Image + caption (full list)',
};

module.exports = [
  {
    name: 'setmenu',
    aliases: ['menustyle'],
    category: 'owner',
    description: 'Set the menu style (1-4)',
    usage: '.setmenu <1-4>',
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

      const applyStyle = async (id) => {
        updateSetting('menustyle', id);
        return sock.sendMessage(chatId, {
          text: buildHint(`Menu style set to ${id}`, MENU_STYLES[id])
        }, { quoted: fake, ...replyOpts() });
      };

      const s = args[0];
      if (s) {
        if (!MENU_STYLES[s]) {
          return sock.sendMessage(chatId, {
            text: buildHint('Invalid style', 'Use .setmenu to see the numbered list of valid styles')
          }, { quoted: fake });
        }
        return applyStyle(s);
      }

      const current = ['1','2','3','4'].includes(String(getSetting('menustyle', '1'))) ? String(getSetting('menustyle', '1')) : '1';
      const sent = await sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Menu Style',
          fields: [['Current', `${current} - ${MENU_STYLES[current]}`]],
          commandsLabel: 'Styles',
          commands: Object.entries(MENU_STYLES).map(([id, label]) => `${label} — setmenu ${id}`),
          footer: 'Reply with a number Or Use .setmenu <number>',
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
          if (MENU_STYLES[leadNum]) await applyStyle(leadNum);
        });
        setTimeout(() => global.replyHandlers?.delete(handlerKey), 120000);
      }
    }
  }
];
