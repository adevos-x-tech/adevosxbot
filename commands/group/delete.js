const isAdmin = require('../../AdevosAuth/isAdmin');

module.exports = [
{
    name: 'delete',
    aliases: ['del', 'delmsg'],
    category: 'group',
    description: 'Delete a replied message (or bulk-delete recent messages from a mentioned user)',
    usage: '.delete (reply to msg) | .delete @user [count]',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isGroup } = context;
      const { isSudo: _isSudoD } = require('../../AdevosAuth/database');

      try {
        if (isGroup) {
          const adminStatus = await isAdmin(sock, chatId, senderId);
          if (!adminStatus.isBotAdmin) {
            return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
          }
          if (!adminStatus.isSenderAdmin && !message.key.fromMe && !_isSudoD(senderId)) {
            return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
          }
        } else {
          if (senderId !== chatId && !message.key.fromMe) {
            return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
          }
        }

        const ctxInfo = message.message?.extendedTextMessage?.contextInfo || {};
        const repliedParticipant = ctxInfo.participant || null;
        const repliedMsgId = ctxInfo.stanzaId || null;

        if (repliedMsgId && repliedParticipant) {
          try {
            await sock.sendMessage(chatId, {
              delete: { remoteJid: chatId, fromMe: false, id: repliedMsgId, participant: repliedParticipant }
            });
          } catch {}
          try {
            if (message.key?.id) {
              await sock.sendMessage(chatId, {
                delete: { remoteJid: chatId, fromMe: message.key.fromMe || false, id: message.key.id, participant: senderId }
              });
            }
          } catch {}
          return;
        }

        const mentioned = Array.isArray(ctxInfo.mentionedJid) && ctxInfo.mentionedJid.length > 0
          ? ctxInfo.mentionedJid[0] : null;
        const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const parts = rawText.trim().split(/\s+/);
        let countArg = 5;
        if (parts.length > 1) {
          const n = parseInt(parts[1], 10);
          if (!isNaN(n) && n > 0) countArg = Math.min(n, 50);
        }

        const targetUser = mentioned || (isGroup ? null : chatId);
        if (!targetUser) return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });

        const store = require('../../Adevoslib/lightweight');
        const chatMessages = store.messages[chatId] || [];
        const userMessages = chatMessages
          .filter(m => {
            const part = m.key.participant || m.key.remoteJid;
            return part === targetUser && !m.message?.protocolMessage;
          })
          .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
          .slice(0, countArg);

        if (userMessages.length === 0) return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });

        for (const m of userMessages) {
          try {
            await sock.sendMessage(chatId, {
              delete: { remoteJid: chatId, fromMe: m.key.fromMe || false, id: m.key.id, participant: m.key.participant || targetUser }
            });
            await new Promise(r => setTimeout(r, 200));
          } catch {}
        }
        try {
          if (message.key?.id) {
            await sock.sendMessage(chatId, {
              delete: { remoteJid: chatId, fromMe: message.key.fromMe || false, id: message.key.id, participant: senderId }
            });
          }
        } catch {}
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
      }
    }
  }
];
