const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const {
  postPersonalStatus,
  downloadStatusMedia,
  processQuotedForStatus,
  buildStatusJidList,
} = require('../../AdevosAuth/statusHelper');

module.exports = [
{
    name: 'tostatus',
    aliases: ['poststatus', 'statuspost'],
    category: 'owner',
    description: 'Post a message/media as a WhatsApp status',
    usage: '.tostatus [caption] (reply to media or type text)',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const caption = args.join(' ').trim();

      const directImage = message.message?.imageMessage;
      const directVideo = message.message?.videoMessage;
      const directAudio = message.message?.audioMessage;
      const quotedMsg   = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!quotedMsg && !caption && !directImage && !directVideo && !directAudio) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Post To Status',
            commands: [
              '.tostatus <text> — post a text status',
              'Reply to image + .tostatus [caption]',
              'Reply to video + .tostatus [caption]',
              'Reply to audio + .tostatus',
              'Reply to sticker + .tostatus (converted to image/video)',
              'Send an image with .tostatus [caption]',
            ],
          })
        }, { quoted: fake });
      }

      try {
        let content   = null;
        let mediaType = 'Text';

        if (directImage && !quotedMsg) {
          const m = await downloadStatusMedia(directImage, 'image');
          if (!m.buffer || m.buffer.length < 100) throw new Error(`Image download failed`);
          content   = { image: m.buffer, mimetype: m.mimetype, caption };
          mediaType = 'Image';
        } else if (directVideo && !quotedMsg) {
          const m = await downloadStatusMedia(directVideo, 'video');
          if (!m.buffer || m.buffer.length < 100) throw new Error(`Video download failed`);
          content   = { video: m.buffer, mimetype: m.mimetype, caption };
          mediaType = 'Video';
        } else if (directAudio && !quotedMsg) {
          const m = await downloadStatusMedia(directAudio, 'audio');
          if (!m.buffer || m.buffer.length < 100) throw new Error(`Audio download failed`);
          content   = { audio: m.buffer, mimetype: m.mimetype || 'audio/mp4', ptt: directAudio.ptt || false };
          mediaType = 'Audio';
        } else if (quotedMsg) {
          const r = await processQuotedForStatus(quotedMsg, caption);
          content   = r.content;
          mediaType = r.mediaType;
        } else if (caption) {
          content   = { text: caption };
          mediaType = 'Text';
        }

        if (!content) {
          return sock.sendMessage(chatId, { text: buildHint('No valid content to post') }, { quoted: fake });
        }

        const statusJidList = await buildStatusJidList(sock);
        const extraOpts = mediaType === 'Text' ? { backgroundColor: '#1b5e20', font: 0 } : {};
        await postPersonalStatus(sock, content, statusJidList, extraOpts);

        const fields = [['Type', mediaType]];
        if (content.caption) fields.push(['Caption', content.caption.substring(0, 60) + (content.caption.length > 60 ? '...' : '')]);
        if (content.text)    fields.push(['Text', content.text.substring(0, 60) + (content.text.length > 60 ? '...' : '')]);
        fields.push(['Recipients', String(statusJidList.length)]);

        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Status Posted', fields }) }, { quoted: fake, ...replyOpts() });
      } catch (err) {
        let errMsg = `Failed: ${err.message}`;
        if (/connection closed/i.test(err.message))    errMsg = 'Connection dropped. Try again.';
        else if (/timed?[\s-]?out/i.test(err.message)) errMsg = 'Timed out. Try a smaller file.';
        else if (/media/i.test(err.message))            errMsg = 'Media upload failed. File may be too large.';
        return sock.sendMessage(chatId, { text: buildHint(errMsg) }, { quoted: fake });
      }
    }
  }
];
