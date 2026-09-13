const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

function fmtAgo(ts) {
  if (!ts) return 'unknown';
  const ms = ts > 1e12 ? ts : ts * 1000; // handle sec vs ms
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s-ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m-ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h-ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d-ago`;
  return `${Math.floor(d / 7)}week-ago`;
}

module.exports = [
  {
    name: 'approval',
    aliases: ['joinapproval', 'joinmode'],
    category: 'group',
    description: 'Toggle group join approval, or list pending requests',
    usage: '.approval on/off | .approval list',
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

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'list') {
        try {
          const pending = await sock.groupRequestParticipantsList(chatId).catch(() => []);
          if (!pending?.length) {
            return sock.sendMessage(chatId, { text: buildHint('No pending join requests') }, { quoted: fake });
          }
          const fields = pending.map(r => {
            const num = (r.jid || '').split('@')[0];
            const ts = r.requestTime || r.time || r.timestamp || null;
            return [`@${num}`, `(${fmtAgo(ts)})`];
          });
          return sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Pending Join Requests', fields }),
            mentions: pending.map(r => r.jid).filter(Boolean),
          }, { quoted: fake, ...replyOpts() });
        } catch (e) {
          return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
        }
      }

      if (!sub || !['on', 'off'].includes(sub)) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Group Join Approval',
            commands: ['approval on — Require admin approval', 'approval off — Allow anyone to join', 'approval list — Show pending requests'],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      try {
        await sock.groupMemberAddMode(chatId, sub === 'on' ? 'approval' : 'all_member_add');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Group Join Approval', fields: [['Status', sub === 'on' ? 'Enabled' : 'Disabled']] })
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
