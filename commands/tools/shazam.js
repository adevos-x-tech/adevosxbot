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
    name: 'shazam',
    aliases: ['identify', 'songid', 'whatsong'],
    category: 'tools',
    description: 'Identify a song from audio, video or voice note',
    usage: '.shazam (send or reply to audio/video)',
    execute: async (sock, message, args, context) => {
      const { chatId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      // ── Media scanner (current msg → quoted msg) ───────────────────────
      const _getMediaBuf = async (msgObj) => {
        const m = msgObj?.message || {};
        const checks = [
          { key: 'audioMessage',  type: 'audio', ext: '.mp3' },
          { key: 'videoMessage',  type: 'video', ext: '.mp4' },
          { key: 'imageMessage',  type: 'image', ext: '.jpg' },
        ];
        for (const { key, type, ext } of checks) {
          if (m[key]) {
            try {
              const stream = await downloadContentFromMessage(m[key], type);
              const chunks = [];
              for await (const chunk of stream) chunks.push(chunk);
              return { buffer: Buffer.concat(chunks), type, ext };
            } catch {}
          }
        }
        return null;
      };

      const _scanMedia = async () => {
        const direct = await _getMediaBuf(message);
        if (direct) return direct;
        const qMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (qMsg) return await _getMediaBuf({ message: qMsg });
        return null;
      };

      // ── Upload helpers — tries multiple hosts in order ─────────────────
      const _uploadUguu = async (filePath) => {
        const form = new FormData();
        form.append('files[]', fs.createReadStream(filePath));
        const res = await axios.post('https://uguu.se/upload', form, {
          headers: form.getHeaders(), timeout: 30000,
        });
        const url = res.data?.files?.[0]?.url || res.data?.url || null;
        if (!url) throw new Error('uguu: no url');
        return url;
      };

      const _uploadTmpfiles = async (filePath) => {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
          headers: form.getHeaders(), timeout: 30000,
        });
        const url = res.data?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/') || null;
        if (!url) throw new Error('tmpfiles: no url');
        return url;
      };

      const _uploadFileio = async (filePath) => {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        const res = await axios.post('https://file.io', form, {
          headers: form.getHeaders(), timeout: 30000,
        });
        const url = res.data?.link || null;
        if (!url) throw new Error('fileio: no url');
        return url;
      };

      const _uploadAny = async (filePath) => {
        for (const fn of [_uploadUguu, _uploadTmpfiles, _uploadFileio]) {
          try { return await fn(filePath); } catch {}
        }
        throw new Error('All upload hosts failed');
      };

      // ── Shazam API helpers — tries multiple APIs in order ──────────────
      const _shazamApis = [
        async (url) => {
          const r = await axios.get('https://apiskeith.top/ai/shazam', {
            params: { url }, timeout: 30000,
          });
          return r.data?.result || r.data;
        },
        async (url) => {
          const r = await axios.get(`https://api.dreaded.site/api/shazam?url=${encodeURIComponent(url)}`, {
            timeout: 30000,
          });
          return r.data?.result || r.data?.data;
        },
        async (url) => {
          const r = await axios.get(`https://api.bk9.dev/tools/shazam?url=${encodeURIComponent(url)}`, {
            timeout: 30000,
          });
          return r.data?.BK9 || r.data?.result;
        },
        async (url) => {
          const r = await axios.get(`https://api.giftedtech.co.ke/api/tools/shazam?apikey=gifted&url=${encodeURIComponent(url)}`, {
            timeout: 30000,
          });
          return r.data?.result || r.data?.data;
        },
      ];

      // Race in parallel — first valid hit wins, dead APIs ignored
      const _identifySong = async (mediaUrl) => {
        try {
          return await Promise.any(_shazamApis.map(async fn => {
            const song = await fn(mediaUrl);
            if (song && (song.title || song.artist || song.artists || song.track)) return song;
            throw new Error('empty');
          }));
        } catch { return null; }
      };

      await sock.sendMessage(chatId, { react: { text: '🎵', key: message.key } });

      const media = await _scanMedia();
      if (!media) {
        await sock.sendMessage(chatId, {
          text: buildHint('Send or reply to an audio/voice note/video to identify the song')
        }, { quoted: fake });
        return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }

      const tmpDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `shazam_${Date.now()}${media.ext}`);

      try {
        fs.writeFileSync(tmpFile, media.buffer);

        let mediaUrl;
        try {
          mediaUrl = await _uploadAny(tmpFile);
        } catch (upErr) {
          await sock.sendMessage(chatId, {
            text: buildHint(`Upload failed: ${upErr.message}`)
          }, { quoted: fake });
          return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }

        const song = await _identifySong(mediaUrl);

        if (song) {
          const title   = song.title  || song.track  || 'Unknown';
          const artist  = song.artists || song.artist || song.subtitle || 'Unknown';
          const album   = song.album   || song.album_name || 'N/A';
          const release = song.release_date || song.year || 'N/A';
          await sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Shazam', fields: [['Title', title], ['Artist', artist], ['Album', album], ['Release', release]] })
          }, { quoted: fake });
          return sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } else {
          await sock.sendMessage(chatId, {
            text: buildHint('Could not identify the song. Try a clearer audio sample.')
          }, { quoted: fake });
          return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }
      } catch (err) {
        await sock.sendMessage(chatId, {
          text: buildHint(`Recognition failed: ${err.message}`)
        }, { quoted: fake });
        return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      } finally {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      }
    }
  }
];
