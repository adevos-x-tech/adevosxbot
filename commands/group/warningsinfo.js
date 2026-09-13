const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');
const {
  getWarnLimit, setWarnLimit, resetWarning, resetAllWarnings, listWarned,
} = require('../../Adevoslib/warnings');

function fmtAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s-ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m-ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h-ago`;
  return `${Math.floor(h / 24)}d-ago`;
}

module.exports = [
  {
    name: 'warnings',
    category: 'group',
    description: 'Show/configure the warning system: limit, reset, warned list',
    usage: '.warnings | .warnings setwarnings <n> | .warnings resetwarnings [@user] | .warnings warned list',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'setwarnings') {
        const n = parseInt(args[1], 10);
        if (!n || n < 1) return sock.sendMessage(chatId, { text: buildHint('Usage: .warnings setwarnings <number>') }, { quoted: fake });
        setWarnLimit(chatId, n);
        return sock.sendMessage(chatId, { text: buildHint(`Warn limit set to ${n}`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'resetwarnings') {
        const { targets } = resolveTargets(message, args.slice(1));
        if (!targets.length) {
          resetAllWarnings(chatId);
          return sock.sendMessage(chatId, { text: buildHint('All warnings reset to default (0) for everyone') }, { quoted: fake, ...replyOpts() });
        }
        resetWarning(chatId, targets[0]);
        return sock.sendMessage(chatId, {
          text: buildHint(`Warnings reset for @${targets[0].split('@')[0]}`),
          mentions: targets,
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'warned' && (args[1] || '').toLowerCase() === 'list') {
        const list = listWarned(chatId);
        if (!list.length) {
          return sock.sendMessage(chatId, { text: buildHint('No one has active warnings in this group') }, { quoted: fake });
        }
        const mentions = list.map(w => `${w.num}@s.whatsapp.net`);
        const fields = list.map(w => [`@${w.num}`, `${w.count} warning(s) — ${w.reason}`]);
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Warned List', fields }),
          mentions,
        }, { quoted: fake, ...replyOpts() });
      }

      // No sub-command → overview
      const limit = getWarnLimit(chatId);
      const list = listWarned(chatId);
      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Warnings',
          fields: [
            ['Warn limit', String(limit)],
            ['Currently warned', String(list.length)],
          ],
          commands: [
            'warnings setwarnings <n>',
            'warnings resetwarnings [@user]',
            'warnings warned list',
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
