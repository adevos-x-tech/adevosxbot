const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildHint } = require('../../Adevoslib/frame');
const { extractViewOnce, downloadViewOnce } = require('./view-once');

const commands = [
  {
    name: 'vv2',
    aliases: ['viewonce2', 'rv'],
    category: 'utility',
    description: "Reveal a view-once message silently to the bot owner's DM",
    usage: 'Reply to a view-once message with .vv2',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const viewOnce = extractViewOnce(message);
      if (!viewOnce) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a view-once message with .vv2') }, { quoted: fake });
      }

      try {
        const dl = await downloadViewOnce(viewOnce);
        if (!dl) return;
        const { buffer, mediaType, meta } = dl;
        const sendObj = mediaType === 'imageMessage'
          ? { image: buffer }
          : mediaType === 'videoMessage'
            ? { video: buffer, mimetype: 'video/mp4' }
            : { audio: buffer, mimetype: 'audio/mpeg', ptt: meta?.ptt || false };

        const ownerNum = global.ownerPhone || String(getSetting('ownerNumber', '') ?? '');
        const privateJid = ownerNum ? `${ownerNum.replace(/[^0-9]/g, '')}@s.whatsapp.net` : senderId;
        // Silent — no confirmation in the current chat, matches the react-to-reveal behavior in main.js
        await sock.sendMessage(privateJid, sendObj);
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];

module.exports = commands;
