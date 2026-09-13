const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'broadcast',
    aliases: ['bc', 'bcast'],
    category: 'owner',
    description: 'Broadcast a message to all groups, or a specific group by id',
    usage: '.broadcast <message> | .broadcast <group-id> <message> | reply to media with .broadcast [caption]',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });

      let rest = [...args];
      let targetId = null;
      if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) targetId = rest.shift();

      const text = rest.join(' ').trim();
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!text && !quoted) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Broadcast', commands: ['broadcast <message>', 'broadcast <group-id> <message>', 'reply to media with .broadcast [caption]'] })
        }, { quoted: fake });
      }

      const sendContent = async (jid) => {
        if (quoted) {
          const media = quoted.imageMessage || quoted.videoMessage;
          if (quoted.imageMessage) {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
            let buf = Buffer.alloc(0);
            for await (const c of stream) buf = Buffer.concat([buf, c]);
            return sock.sendMessage(jid, { image: buf, caption: text || quoted.imageMessage.caption || '' });
          }
          if (quoted.videoMessage) {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
            let buf = Buffer.alloc(0);
            for await (const c of stream) buf = Buffer.concat([buf, c]);
            return sock.sendMessage(jid, { video: buf, caption: text || quoted.videoMessage.caption || '' });
          }
          const qText = quoted.conversation || quoted.extendedTextMessage?.text || text;
          return sock.sendMessage(jid, { text: qText });
        }
        return sock.sendMessage(jid, { text });
      };

      if (targetId) {
        try {
          await sendContent(targetId);
          return sock.sendMessage(chatId, { text: buildHint('Broadcast sent to that group') }, { quoted: fake, ...replyOpts() });
        } catch (e) {
          return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
        }
      }

      // No id given → broadcast to all groups
      try {
        const groups = await sock.groupFetchAllParticipating();
        const ids = Object.keys(groups || {});
        let sent = 0, failed = 0;
        for (const gid of ids) {
          try { await sendContent(gid); sent++; } catch { failed++; }
          await new Promise(r => setTimeout(r, 300));
        }
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Broadcast Complete', fields: [['Sent', String(sent)], ['Failed', String(failed)], ['Total groups', String(ids.length)]] })
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
