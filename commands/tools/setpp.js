const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'setpp',
    aliases: ['setpfp', 'setdp', 'updatepp'],
    category: 'tools',
    description: 'Set the bot profile picture — reply to an image, or mention someone to use theirs',
    usage: '.setpp (reply to image) | .setpp @user',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      const imgMsg = quoted?.imageMessage || quoted?.stickerMessage;

      if (!imgMsg && !mentioned) {
        await sock.sendMessage(chatId, { text: buildHint('Reply to an image, or mention someone to use their profile picture') }, { quoted: fake });
        return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }

      try {
        let buffer;
        if (imgMsg) {
          const stream = await downloadContentFromMessage(imgMsg, 'image');
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          buffer = Buffer.concat(chunks);
        } else {
          const url = await sock.profilePictureUrl(mentioned, 'image');
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
          buffer = Buffer.from(res.data);
        }

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const imgPath = path.join(tmpDir, `setpp_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, buffer);

        await sock.updateProfilePicture(sock.user.id, { url: imgPath });
        fs.unlinkSync(imgPath);

        await sock.sendMessage(chatId, { text: buildHint('Bot profile picture updated') }, { quoted: fake, ...replyOpts() });
        return sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { text: buildHint(`Failed to update picture: ${err.message}`) }, { quoted: fake });
        return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }
    }
  }
];
