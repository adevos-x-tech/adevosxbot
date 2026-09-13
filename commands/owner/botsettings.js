const { getSetting } = require('../../AdevosAuth/database');
const { getBotName, getBotStyle, getForwardedChannelName, getFooter, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');
const { getStyleList } = require('../../Adevoslib/fontStyles');

module.exports = [
  {
    name: 'settings',
    aliases: ['botsettings'],
    category: 'owner',
    description: 'Show all current bot settings',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const fontKey = getSetting('fontstyle', 'none');
      const fontName = getStyleList().find(s => s.key === fontKey)?.name || 'Default';
      const menuStyle = String(getSetting('menustyle', '1'));
      const botStyle = getBotStyle() === 'forwarded' ? `Forwarded (${getForwardedChannelName()})` : 'Normal';
      const mode = global.mode || getSetting('mode', 'public');
      const prefix = getSetting('prefix', '.') || 'none';
      const footer = getFooter() || 'Off';

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Bot Settings',
          fields: [
            ['Bot name', getBotName()],
            ['Prefix', prefix],
            ['Bot mode', mode],
            ['Bot style', botStyle],
            ['Menu style', menuStyle],
            ['Font', fontName],
            ['Footer', footer],
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
