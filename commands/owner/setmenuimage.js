const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const MENU_MEDIA_DIR = path.join(__dirname, '../../data/menuMedia');

function ensureDir() {
  if (!fs.existsSync(MENU_MEDIA_DIR)) fs.mkdirSync(MENU_MEDIA_DIR, { recursive: true });
}

async function downloadBuf(msgContent, type) {
  const stream = await downloadContentFromMessage(msgContent, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

/**
 * saveMenuMedia — persists a buffer to disk and records it as the active
 * menu media ({ type, path }). Reused by setmenuimage/setmenuaudio/setmenuvideo.
 */
function saveMenuMedia(type, buffer, ext) {
  ensureDir();
  const file = path.join(MENU_MEDIA_DIR, `menu.${ext}`);
  fs.writeFileSync(file, buffer);
  updateSetting('menuMedia', { type, path: file });
  // keep legacy key in sync for older code paths that still read it directly
  if (type === 'image') updateSetting('menuimage', file);
}

/**
 * getMenuMedia — { type, buffer|url } for menu.js to render. Exported so
 * menu.js can pull whatever was last configured (image/video/audio, URL or file).
 */
function getMenuMedia() {
  const media = getSetting('menuMedia', null);
  if (media && media.path && fs.existsSync(media.path)) {
    return { type: media.type, buffer: fs.readFileSync(media.path) };
  }
  const legacyUrl = getSetting('menuimage', 'https://i.imgur.com/u5FC6ZI.jpeg');
  if (legacyUrl && legacyUrl.startsWith('http')) return { type: 'image', url: legacyUrl };
  return null;
}

async function resolveFromReplyOrMention(sock, message, context) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;

  if (quoted?.stickerMessage) {
    const buf = await downloadBuf(quoted.stickerMessage, 'sticker');
    try {
      const sharp = require('sharp');
      const png = await sharp(buf).png().toBuffer();
      return { type: 'image', buffer: png, ext: 'png' };
    } catch {
      return { type: 'image', buffer: buf, ext: 'webp' };
    }
  }
  if (quoted?.imageMessage) {
    const buf = await downloadBuf(quoted.imageMessage, 'image');
    return { type: 'image', buffer: buf, ext: 'jpg' };
  }
  if (quoted?.videoMessage) {
    const buf = await downloadBuf(quoted.videoMessage, 'video');
    return { type: 'video', buffer: buf, ext: 'mp4' };
  }
  if (quoted?.audioMessage) {
    const buf = await downloadBuf(quoted.audioMessage, 'audio');
    return { type: 'audio', buffer: buf, ext: 'mp3' };
  }

  // Mention or reply to a person → use their profile picture
  const mentioned = ctx?.mentionedJid?.[0];
  const repliedTo = ctx?.participant;
  const targetJid = mentioned || repliedTo;
  if (targetJid) {
    try {
      const url = await sock.profilePictureUrl(targetJid, 'image');
      return { type: 'image', url };
    } catch {
      return null;
    }
  }
  return null;
}

const commands = [
  {
    name: 'setmenuimage',
    aliases: ['menuimage', 'setmenuimg', 'setmenuaudio', 'menuaudio', 'setmenuvideo', 'menuvideo'],
    category: 'owner',
    description: 'Set the menu banner: image URL, reply to image/video/audio/sticker, or mention a user for their profile picture',
    usage: '.setmenuimage <url> | reply to media | .setmenuimage reset',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] })
        }, { quoted: fake });
      }

      if ((args[0] || '').toLowerCase() === 'reset') {
        updateSetting('menuMedia', null);
        updateSetting('menuimage', '');
        return sock.sendMessage(chatId, { text: buildHint('Menu media reset to default') }, { quoted: fake, ...replyOpts() });
      }

      const url = args[0]?.trim();
      if (url && url.startsWith('http')) {
        updateSetting('menuMedia', null);
        updateSetting('menuimage', url);
        return sock.sendMessage(chatId, { text: buildHint('Menu image set from URL') }, { quoted: fake, ...replyOpts() });
      }

      const resolved = await resolveFromReplyOrMention(sock, message, context);
      if (!resolved) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Menu Media',
            fields: [['How to set', 'Provide a URL, reply to image/video/audio/sticker, or mention a user']],
            commands: ['setmenuimage <url>', 'setmenuimage reset'],
          })
        }, { quoted: fake });
      }

      if (resolved.url) {
        updateSetting('menuMedia', null);
        updateSetting('menuimage', resolved.url);
      } else {
        saveMenuMedia(resolved.type, resolved.buffer, resolved.ext);
      }

      return sock.sendMessage(chatId, {
        text: buildHint(`Menu ${resolved.type} updated`)
      }, { quoted: fake, ...replyOpts() });
    }
  }
];

// Attach helpers onto the exported array (NOT `module.exports.x = ...` then
// `module.exports = [...]` — that second assignment silently discards
// anything attached before it. This is the pattern used everywhere else in
// the codebase and it's why ~80 files' helper exports are currently dead —
// see the note left for the moderation/utility batch.)
commands.getMenuMedia = getMenuMedia;
commands.saveMenuMedia = saveMenuMedia;
module.exports = commands;
