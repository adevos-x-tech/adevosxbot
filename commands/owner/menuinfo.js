const { getSetting } = require('../../AdevosAuth/database');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, replyOpts } = require('../../Adevoslib/frame');

const MENU_STYLES = {
  '1': 'Plain text (full list, read more)',
  '2': 'Categories + picture (reply to browse)',
  '3': 'Categories only (reply to browse)',
  '4': 'Image + caption (full list)',
};

module.exports = [
  {
    name: 'menuinfo',
    aliases: ['menudetails'],
    category: 'owner',
    description: 'Show current menu settings and customization commands',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const style = ['1','2','3','4'].includes(String(getSetting('menustyle', '1'))) ? String(getSetting('menustyle', '1')) : '1';
      const media = getSetting('menuMedia', null);
      const legacyImg = getSetting('menuimage', '');
      const mediaLabel = media ? `${media.type} (custom)` : (legacyImg ? 'image (URL)' : 'Default');
      const cats = global.fileCategories || {};
      const total = Object.values(cats).reduce((t, c) => t + c.length, 0);

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Menu Settings',
          fields: [
            ['Style', `${style} - ${MENU_STYLES[style] || '?'}`],
            ['Media', mediaLabel],
            ['Categories', String(Object.keys(cats).length)],
            ['Total commands', String(total)],
          ],
          commandsLabel: 'Customize',
          commands: [
            'setmenu <1-4>',
            'setmenuimage <url>',
            'setmenuimage (reply to image/video/audio/sticker)',
            'setmenuimage reset',
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
