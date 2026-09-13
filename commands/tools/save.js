const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildHint } = require('../../Adevoslib/frame');

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

function getMediaFromMessage(msgContainer) {
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
  for (const t of types) {
    if (msgContainer?.[t]) return { type: t, msg: msgContainer[t] };
  }
  return null;
}

function getQuotedMedia(message) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  return quoted ? getMediaFromMessage(quoted) : null;
}

function ownerPrivateJid(fallbackId) {
  const ownerNum = global.ownerPhone || String(getSetting('ownerNumber', '') ?? '');
  return ownerNum ? `${ownerNum.replace(/[^0-9]/g, '')}@s.whatsapp.net` : fallbackId;
}

/**
 * saveMediaOrText — downloads media (or grabs text) from a raw message
 * object and forwards it silently to the bot owner's DM. Shared by the
 * `.save` command and the react-to-save-status hook in main.js.
 * `sourceMessage` should be the *actual* message content object (e.g.
 * `originalMsg.message` for a stored status, or a quotedMessage payload).
 */
async function saveMediaOrText(sock, sourceMessage, fallbackJid) {
  if (!sourceMessage) return false;
  const privateJid = ownerPrivateJid(fallbackJid);
  const media = getMediaFromMessage(sourceMessage);
  const textContent = sourceMessage.conversation || sourceMessage.extendedTextMessage?.text;

  if (!media && !textContent) return false;

  if (textContent && !media) {
    await sock.sendMessage(privateJid, { text: `> Saved\n\n${textContent}` });
    return true;
  }

  const typeMap = {
    imageMessage: { mime: 'image/jpeg', dl: 'image' },
    videoMessage: { mime: 'video/mp4', dl: 'video' },
    audioMessage: { mime: 'audio/mpeg', dl: 'audio' },
    stickerMessage: { mime: 'image/webp', dl: 'sticker' },
    documentMessage: { mime: media.msg.mimetype || 'application/octet-stream', dl: 'document' },
  };
  const info = typeMap[media.type] || { mime: 'application/octet-stream', dl: media.type.replace('Message', '') };
  const buf = await dlBuffer(media.msg, info.dl);

  const sendObj = media.type === 'imageMessage'
    ? { image: buf }
    : media.type === 'videoMessage'
      ? { video: buf, mimetype: 'video/mp4' }
      : media.type === 'audioMessage'
        ? { audio: buf, mimetype: info.mime, ptt: media.msg.ptt || false }
        : media.type === 'stickerMessage'
          ? { sticker: buf }
          : { document: buf, mimetype: info.mime, fileName: media.msg.fileName || 'saved.bin' };

  await sock.sendMessage(privateJid, sendObj);
  return true;
}

const commands = [
  {
    name: 'save',
    aliases: ['savestatus', 'send'],
    category: 'tools',
    description: 'Save a status/message and send it silently to your private chat',
    usage: '.save (reply to any status or media) — or react with any emoji on a status',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);

      const media = getQuotedMedia(message);
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!media && !quoted?.conversation && !quoted?.extendedTextMessage?.text) {
        return sock.sendMessage(chatId, { text: buildHint('Reply to a status or message with .save to save it') }, { quoted: fake });
      }

      try {
        const saved = await saveMediaOrText(sock, quoted, senderId);
        if (!saved) {
          await sock.sendMessage(chatId, { text: buildHint('Nothing to save from that message') }, { quoted: fake });
        }
        // Silent on success per spec — no confirmation sent to the chat.
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }
    }
  }
];

commands.saveMediaOrText = saveMediaOrText;
module.exports = commands;
