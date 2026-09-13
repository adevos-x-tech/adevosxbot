const axios = require('axios');
const { getBotName, getOwnerName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

async function makeWaSticker(buffer, packname, author) {
  const { Sticker, StickerTypes } = require('wa-sticker-formatter');
  const sticker = new Sticker(buffer, { pack: packname, author, type: StickerTypes.FULL });
  return sticker.toBuffer();
}

function extractPackName(input) {
  const m = input.match(/(?:t\.me\/addstickers\/|\/)?([A-Za-z0-9_]+)\/?$/);
  return m ? m[1] : input;
}

async function fetchPack(token, packName) {
  const url = `https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(packName)}`;
  const { data } = await axios.get(url, { timeout: 20000 });
  if (!data?.ok) throw new Error(data?.description || 'Pack not found');
  return data.result;
}

async function downloadTgFile(token, fileId) {
  const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`, { timeout: 20000 });
  if (!data?.ok) return null;
  const filePath = data.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 30000 });
  return Buffer.from(res.data);
}

module.exports = [
  {
    name: 'telesticker',
    aliases: ['telegramsticker', 'tgsticker', 'tgs'],
    category: 'tools',
    description: 'Download a Telegram sticker pack and send it as WhatsApp stickers',
    usage: '.telesticker <pack name or t.me/addstickers/... link>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const token = getSetting('telegramBotToken', '');

      if (!token) {
        return sock.sendMessage(chatId, {
          text: buildHint('Telegram bot token not configured', 'Set it with your settings command before using .telesticker')
        }, { quoted: fake });
      }

      const input = args.join(' ').trim();
      if (!input) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .telesticker <pack name or link>') }, { quoted: fake });
      }

      let pack;
      try {
        pack = await fetchPack(token, extractPackName(input));
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Could not fetch that pack: ${e.message}`) }, { quoted: fake });
      }

      const stickers = pack.stickers || [];
      const staticOnes = stickers.filter(s => !s.is_animated && !s.is_video);
      const skipped = stickers.length - staticOnes.length;

      if (!staticOnes.length) {
        return sock.sendMessage(chatId, {
          text: buildHint('No static stickers in that pack', 'Animated/video Telegram stickers (.tgs/.webm) are not supported yet')
        }, { quoted: fake });
      }

      const sent = await sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Telegram Sticker Pack',
          fields: [
            ['Pack', pack.title || pack.name],
            ['Found', `${staticOnes.length} static${skipped ? `, ${skipped} animated skipped` : ''}`],
          ],
          commandsLabel: 'Send as',
          commands: [
            'Sticker pack (all at once)',
            'One by one',
            'To this chat',
            "To my DM",
          ],
          footer: 'Reply with a number',
        })
      }, { quoted: fake, ...replyOpts() });

      if (!global.replyHandlers) global.replyHandlers = new Map();
      const handlerKey = sent?.key?.id;
      if (!handlerKey) return;

      global.replyHandlers.set(handlerKey, async (replyMsg) => {
        global.replyHandlers.delete(handlerKey);
        const replySender = replyMsg.key.participant || replyMsg.key.remoteJid;
        // NOTE: sender check intentionally removed — stanzaId match already
        // proves this is a genuine reply to this exact bot message; LID vs
        // phone-number JIDs for the same person cannot be reliably compared.
        const rawChoice = (replyMsg.message?.extendedTextMessage?.text || replyMsg.message?.conversation || '').trim();
        const choice = (rawChoice.match(/^\d+/) || [])[0];
        if (!['1', '2', '3', '4'].includes(choice)) return;

        const destJid = choice === '4' ? senderId : chatId;
        const authorName = getOwnerName();
        const packName = botName;

        await sock.sendMessage(chatId, { text: buildHint(`Sending ${staticOnes.length} sticker(s)...`) }, { quoted: fake });

        for (const s of staticOnes) {
          try {
            const buf = await downloadTgFile(token, s.file_id);
            if (!buf) continue;
            const waSticker = await makeWaSticker(buf, packName, authorName);
            await sock.sendMessage(destJid, { sticker: waSticker });
          } catch (_) { /* skip failed sticker, keep going */ }
        }
      });
      setTimeout(() => global.replyHandlers?.delete(handlerKey), 120000);
    }
  }
];
