'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
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
    name: 'tovideo',
    aliases: ['stickertovideo', 'gifvideo', 'webptovideo'],
    category: 'tools',
    description: 'Convert animated sticker to video',
    usage: '.tovideo (reply to animated sticker)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mediaMsg = quoted?.stickerMessage || quoted?.videoMessage;
      if (!mediaMsg) {
        return sock.sendMessage(chatId, {
          text: buildHint('Reply to an animated sticker', '.tovideo (reply to sticker)')
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const dlType = quoted.stickerMessage ? 'sticker' : 'video';
        const buf = await dlBuffer(mediaMsg, dlType);

        // WhatsApp animated stickers use ANIM/ANMF WebP chunks that ffmpeg's
        // webp_pipe demuxer cannot decode. Convert animated WebP → GIF via
        // sharp (which uses libvips and handles ANIM frames), then GIF → MP4
        // via ffmpeg.
        const os = require('os');
        const { execSync } = require('child_process');
        const sharp = require('sharp');
        const ts = Date.now();
        const tmpGif = path.join(os.tmpdir(), `stk_${ts}.gif`);
        const tmpOut = path.join(os.tmpdir(), `stk_${ts}.mp4`);
        let mp4;
        try {
          const gifBuf = await sharp(buf, { animated: true }).gif().toBuffer();
          fs.writeFileSync(tmpGif, gifBuf);
          const ffmpegBin = (() => {
            try { const p = execSync('which ffmpeg 2>/dev/null').toString().trim(); if (p) return p; } catch {}
            return 'ffmpeg';
          })();
          execSync(
            `"${ffmpegBin}" -y -i "${tmpGif}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=15" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${tmpOut}"`,
            { timeout: 30000, stdio: 'pipe' }
          );
          mp4 = fs.readFileSync(tmpOut);
        } finally {
          try { fs.unlinkSync(tmpGif); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
        }

        await sock.sendMessage(chatId, {
          video: mp4,
          mimetype: 'video/mp4',
          caption: 'Converted to Video',
          ...replyOpts()
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
