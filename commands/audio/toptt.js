'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
const { getSetting } = require('../../AdevosAuth/database');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TEMP = path.join(__dirname, '../../tmp');
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP, { recursive: true });

const ffmpegStatic = require('fluent-ffmpeg');
function _detectFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const { execSync } = require('child_process');
    const p = execSync('which ffmpeg 2>/dev/null').toString().trim();
    if (p) return p;
  } catch (_) {}
  // Scan known Nix store pattern
  try {
    const { execSync } = require('child_process');
    const p = execSync('ls /nix/store/*replit-runtime-path*/bin/ffmpeg 2>/dev/null | tail -1').toString().trim();
    if (p) return p;
  } catch (_) {}
  return 'ffmpeg';
}
const FFMPEG_PATH = _detectFfmpeg();
try { ffmpegStatic.setFfmpegPath(FFMPEG_PATH); } catch (_) {}

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

function getAudioOrVideo(message) {
  const msg = message.message || {};
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
  if (msg.audioMessage) return { msg: msg.audioMessage, dlType: 'audio' };
  if (msg.videoMessage) return { msg: msg.videoMessage, dlType: 'video' };
  if (quoted?.audioMessage) return { msg: quoted.audioMessage, dlType: 'audio' };
  if (quoted?.videoMessage) return { msg: quoted.videoMessage, dlType: 'video' };
  return null;
}

async function convertToAudio(inputBuf, inputExt) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    const tmpIn = path.join(TEMP, `au_in_${Date.now()}.${inputExt}`);
    const tmpOut = path.join(TEMP, `au_out_${Date.now()}.mp3`);
    fs.writeFileSync(tmpIn, inputBuf);
    ffmpeg(tmpIn)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .outputOptions(['-loglevel', 'error'])
      .output(tmpOut)
      .on('end', () => {
        const result = fs.readFileSync(tmpOut);
        fs.unlinkSync(tmpIn);
        fs.unlinkSync(tmpOut);
        resolve(result);
      })
      .on('error', (err) => {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
        reject(err);
      })
      .run();
  });
}

async function applyAudioEffect(inputBuf, inputExt, ffmpegFilter) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    const tmpIn = path.join(TEMP, `fx_in_${Date.now()}.${inputExt}`);
    const tmpOut = path.join(TEMP, `fx_out_${Date.now()}.mp3`);
    fs.writeFileSync(tmpIn, inputBuf);
    ffmpeg(tmpIn)
      .noVideo()
      .audioFilter(ffmpegFilter)
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .outputOptions(['-loglevel', 'error'])
      .output(tmpOut)
      .on('end', () => {
        const result = fs.readFileSync(tmpOut);
        fs.unlinkSync(tmpIn);
        fs.unlinkSync(tmpOut);
        resolve(result);
      })
      .on('error', (err) => {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
        reject(err);
      })
      .run();
  });
}




module.exports = [
{
    name: 'toptt',
    aliases: ['voicenote', 'ptt'],
    category: 'audio',
    description: 'Convert audio/video to voice note (PTT)',
    usage: '.toptt (reply to audio/video)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const media = getAudioOrVideo(message);
      if (!media) {
        return sock.sendMessage(chatId, {
          text: buildHint('Reply to audio/video')
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const inputBuf = await dlBuffer(media.msg, media.dlType);
        const ext = media.dlType === 'video' ? 'mp4' : 'ogg';
        const audioBuf = await convertToAudio(inputBuf, ext);

        await sock.sendMessage(chatId, {
          audio: audioBuf,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
          ...replyOpts(),
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
          text: buildHint(`Failed: ${err.message}`)
        }, { quoted: fake });
      }
    }
  }
];
