const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const isAdmin = require('../../AdevosAuth/isAdmin');

async function dlBuf(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = [
  {
    name: 'hidetag',
    aliases: ['htag', 'h.tag'],
    category: 'group',
    description: 'Tag all members silently (no visible list) — works standalone, with text, replying to media, or with a group id from anywhere',
    usage: '.hidetag | .hidetag <message> | .hidetag <group-id> [message] | reply to a message with .hidetag',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const inGroup = chatId.endsWith('@g.us');

      let rest = [...args];
      let targetId = inGroup ? chatId : null;
      if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) targetId = rest.shift();

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .hidetag <group-id> [message]', 'Or run it inside a group') }, { quoted: fake });
      }

      const perms = targetId === chatId
        ? { isSenderAdmin, isBotAdmin }
        : await isAdmin(sock, targetId, senderId).catch(() => ({ isSenderAdmin: false, isBotAdmin: false }));

      if (!perms.isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      }
      if (!perms.isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        const participants = meta.participants.map(p => p.id);
        const msgText = rest.join(' ');
        // Quoted-media forwarding only applies when acting on the CURRENT
        // chat — a quote can't reference a message from a different group.
        const quoted = (targetId === chatId)
          ? message.message?.extendedTextMessage?.contextInfo?.quotedMessage
          : null;

        if (quoted) {
          if (quoted.imageMessage) {
            const buf = await dlBuf(quoted.imageMessage, 'image');
            await sock.sendMessage(targetId, { image: buf, caption: quoted.imageMessage.caption || msgText || '', mentions: participants });
          } else if (quoted.videoMessage) {
            const buf = await dlBuf(quoted.videoMessage, 'video');
            await sock.sendMessage(targetId, { video: buf, caption: quoted.videoMessage.caption || msgText || '', mentions: participants });
          } else if (quoted.stickerMessage) {
            const buf = await dlBuf(quoted.stickerMessage, 'sticker');
            await sock.sendMessage(targetId, { sticker: buf, mentions: participants });
          } else if (quoted.audioMessage) {
            const buf = await dlBuf(quoted.audioMessage, 'audio');
            await sock.sendMessage(targetId, { audio: buf, ptt: quoted.audioMessage.ptt || false, mentions: participants });
          } else {
            const text = quoted.conversation || quoted.extendedTextMessage?.text || msgText;
            if (text) {
              await sock.sendMessage(targetId, { text, mentions: participants });
            } else {
              await sock.sendMessage(chatId, { text: buildHint("Can't forward this message type") }, { quoted: fake });
            }
          }
        } else if (msgText) {
          await sock.sendMessage(targetId, { text: msgText, mentions: participants });
        } else {
          await sock.sendMessage(targetId, { text: `${botName}\nAttention everyone!`, mentions: participants });
        }

        if (targetId !== chatId) {
          await sock.sendMessage(chatId, { text: buildHint(`Tagged everyone in ${meta.subject || 'the group'}`) }, { quoted: fake });
        } else {
          // Delete the invoking .hidetag command message after sending (in-group only)
          try {
            await sock.sendMessage(chatId, {
              delete: { remoteJid: chatId, fromMe: message.key.fromMe, id: message.key.id, participant: message.key.participant || senderId }
            });
          } catch (_) {}
        }
      } catch (e) {
        await sock.sendMessage(chatId, { text: buildHint(`Error: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
