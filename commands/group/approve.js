const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

function displayNum(jid) {
  return (jid || '').split('@')[0];
}

module.exports = [
  {
    name: 'approve',
    aliases: ['acceptjoin', 'approvall'],
    category: 'group',
    description: 'Approve pending join requests (all if no target given), or reject via "approve reject"',
    usage: '.approve | .approve @user | .approve 255... | .approve reject @user',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }
      if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin!']] }) }, { quoted: fake });
      }

      // `.approve reject ...` — delegate to the reject flow with the same target resolution
      const isRejectDelegate = (args[0] || '').toLowerCase() === 'reject';
      const restArgs = isRejectDelegate ? args.slice(1) : args;

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const numArgs  = restArgs.map(a => a.replace(/[^0-9]/g, '')).filter(n => n.length >= 7);
      let targets = mentions.length ? mentions
        : numArgs.length ? numArgs.map(n => `${n}@s.whatsapp.net`)
        : null; // null = all pending (approve only; reject requires a target)

      const action = isRejectDelegate ? 'reject' : 'approve';

      try {
        if (!targets) {
          if (isRejectDelegate) {
            return sock.sendMessage(chatId, { text: buildHint('Mention someone or give a number to reject') }, { quoted: fake });
          }
          const pending = await sock.groupRequestParticipantsList(chatId).catch(() => []);
          targets = (pending || []).map(r => r.jid).filter(Boolean);
          if (!targets.length) {
            return sock.sendMessage(chatId, { text: buildHint('No pending join requests') }, { quoted: fake });
          }
        }
        await sock.groupRequestParticipantsUpdate(chatId, targets, action);
        const nums = targets.map(t => `+${displayNum(t)}`).join(', ');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: action === 'approve' ? 'Approved' : 'Rejected', fields: [[`${targets.length} member(s)`, nums]] }),
          mentions: targets,
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
