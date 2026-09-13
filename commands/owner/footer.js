const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const DEFAULT_FOOTER = '𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐀𝐝𝐞𝐯𝐨𝐬-𝐗 𝐓𝐞𝐜𝐡 ⓒ';

module.exports = [
  {
    name: 'footer',
    aliases: ['setfooter'],
    category: 'owner',
    description: 'Customize, reset, enable or disable the footer on bot replies',
    usage: '.footer <text> | .footer reset | .footer on | .footer off',
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

      const sub = (args[0] || '').toLowerCase();
      const enabled = getSetting('footerEnabled', true);
      const current = getSetting('footerText', DEFAULT_FOOTER) || DEFAULT_FOOTER;

      if (!sub) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Footer',
            fields: [
              ['Status', enabled ? 'On' : 'Off'],
              ['Current', current],
            ],
            commands: [
              'footer <text>',
              'footer reset',
              'footer on',
              'footer off',
            ],
            footer: 'Reply with numbers Or Use specific commands',
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'on') {
        updateSetting('footerEnabled', true);
        return sock.sendMessage(chatId, { text: buildHint('Footer turned ON') }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'off') {
        updateSetting('footerEnabled', false);
        return sock.sendMessage(chatId, { text: buildHint('Footer turned OFF') }, { quoted: fake });
      }

      if (sub === 'reset') {
        updateSetting('footerText', DEFAULT_FOOTER);
        updateSetting('footerEnabled', true);
        return sock.sendMessage(chatId, {
          text: buildHint(`Footer reset to default`, DEFAULT_FOOTER)
        }, { quoted: fake, ...replyOpts() });
      }

      const newFooter = args.join(' ').trim();
      updateSetting('footerText', newFooter);
      updateSetting('footerEnabled', true);
      return sock.sendMessage(chatId, {
        text: buildHint('Footer updated', newFooter)
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
