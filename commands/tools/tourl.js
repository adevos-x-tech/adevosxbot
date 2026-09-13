'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { getSetting } = require('../../AdevosAuth/database');
const { isLidJid, resolvePhoneFromLid } = require('../../AdevosAuth/lidResolver');

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

async function TelegraPh(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const res = await axios({
    url: 'https://telegra.ph/upload',
    method: 'POST',
    headers: form.getHeaders(),
    data: form
  });
  return 'https://telegra.ph' + res.data[0].src;
}

async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 60000
  });
  return (res.data || '').trim();
}

async function uploadMedia(filePath, ext) {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  if (imageExts.includes(ext)) {
    try { return await TelegraPh(filePath); } catch (_) {}
  }
  return await uploadToCatbox(filePath);
}

const _mediaHandlers = {
  imageMessage:    { type: 'image',    ext: '.jpg' },
  videoMessage:    { type: 'video',    ext: '.mp4' },
  audioMessage:    { type: 'audio',    ext: '.mp3' },
  documentMessage: { type: 'document', ext: null   },
  stickerMessage:  { type: 'sticker',  ext: '.webp' }
};

async function extractMedia(message) {
  const m = message.message || {};
  for (const key in _mediaHandlers) {
    if (m[key]) {
      const { type, ext } = _mediaHandlers[key];
      const stream = await downloadContentFromMessage(m[key], type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (key === 'documentMessage') {
        const fileName = m.documentMessage.fileName || 'file.bin';
        return { buffer, ext: path.extname(fileName) || '.bin' };
      }
      return { buffer, ext };
    }
  }
  return null;
}

async function extractQuotedMedia(message) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;
  return extractMedia({ message: quoted });
}

function getQuotedMedia(message) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
  for (const t of types) {
    if (quoted[t]) return { type: t, msg: quoted[t] };
  }
  return null;
}




module.exports = [
{
    name: 'tourl',
    aliases: ['upload', 'getlink', 'fileurl'],
    category: 'tools',
    description: 'Upload any media/file and get a direct URL',
    usage: '.tourl (reply to any media)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      try {
        await sock.sendMessage(chatId, { react: { text: '🔺', key: message.key } });

        let media = await extractMedia(message) || await extractQuotedMedia(message);

        if (!media) {
          return sock.sendMessage(chatId, {
            text: buildHint('Reply to media to generate a link')
          }, { quoted: fake });
        }

        const tempDir = path.join(process.cwd(), 'data', 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempPath = path.join(tempDir, `tourl_${Date.now()}${media.ext}`);
        fs.writeFileSync(tempPath, media.buffer);

        let url;
        try {
          url = await uploadMedia(tempPath, media.ext);
        } finally {
          setTimeout(() => {
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
          }, 2000);
        }

        if (!url) {
          return sock.sendMessage(chatId, { text: buildHint('Media upload unsuccessful') }, { quoted: fake });
        }

        const card = buildFrame({ title: 'Media URL', fields: [['Link', url]] });
        await sock.sendMessage(chatId, { text: card, ...replyOpts() }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

      } catch (error) {
        console.error('[tourl] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: buildHint('Media conversion to link failed') }, { quoted: fake });
      }
    }
  }
];
