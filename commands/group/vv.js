const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
const { extractViewOnce, downloadViewOnce } = require('./view-once');

const commands = [
  {
    name: 'vv',
    aliases: ['viewonce'],
    category: 'utility',
    description: 'Reveal a view-once message in the current chat',
    usage: 'Reply to a view-once message with .vv',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const viewOnce = extractViewOnce(message);
      if (!viewOnce) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a view-once message with .vv') }, { quoted: fake });
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

        await sock.sendMessage(chatId, { ...sendObj, ...replyOpts() }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];

module.exports = commands;
