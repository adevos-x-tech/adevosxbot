const crypto = require('crypto');
const { downloadContentFromMessage: _dlContent } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

async function _tosDownloadBuf(msg, type) {
  const stream = await _dlContent(msg, type);
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}
async function _tosBuildPayload(quotedMessage, captionText) {
  if (!quotedMessage) return captionText ? { text: captionText } : null;
  if (quotedMessage.imageMessage) return { image: await _tosDownloadBuf(quotedMessage.imageMessage, 'image'), caption: captionText || quotedMessage.imageMessage.caption || '' };
  if (quotedMessage.videoMessage) return { video: await _tosDownloadBuf(quotedMessage.videoMessage, 'video'), caption: captionText || quotedMessage.videoMessage.caption || '' };
  if (quotedMessage.audioMessage) return { audio: await _tosDownloadBuf(quotedMessage.audioMessage, 'audio'), mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg' };
  if (quotedMessage.stickerMessage) return { sticker: await _tosDownloadBuf(quotedMessage.stickerMessage, 'sticker') };
  const txt = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
  const final = captionText || txt || '';
  return final ? { text: final } : null;
}
async function _tosSendGroupStatus(sock, jid, content) {
  const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
  const inside = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
  const messageSecret = crypto.randomBytes(32);
  const m = generateWAMessageFromContent(jid, {
    messageContextInfo: { messageSecret },
    groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
  }, {});
  await sock.relayMessage(jid, m.message, { messageId: m.key.id });
  return m;
}




// ============================================================
// GROUP ANTI-MEDIA HANDLER FUNCTIONS (called from main.cjs)
// ============================================================
const { isSudo } = require('../../AdevosAuth/database');

module.exports = [
{
    name: 'tosgroup',
    aliases: ['togroupstatus', 'groupstatus'],
    category: 'group',
    description: 'Send text/media to group status',
    usage: '.tosgroup <text or reply to media>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      const textAfterCmd = rawText.replace(/^[.!#/]?\s*(tosgroup|togroupstatus|groupstatus)\s*/i, '').trim();
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!quotedMessage && !textAfterCmd) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Post To Group Status', commands: ['tosgroup <text>', 'tosgroup (reply to media)'] })
        }, { quoted: fake });
      }

      try {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        const payload = await _tosBuildPayload(quotedMessage, textAfterCmd);
        if (!payload) {
          return sock.sendMessage(chatId, { text: buildHint('Could not build status from that message') }, { quoted: fake });
        }
        await _tosSendGroupStatus(sock, chatId, payload);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint('Status broadcasted to the group') }, { quoted: fake, ...replyOpts() });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
