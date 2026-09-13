const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendWithCopy } = require('../../Adevoslib/interactive');

module.exports = [
  {
    name: 'mygroups',
    aliases: ['groups', 'listgroups'],
    category: 'owner',
    description: 'List all groups the bot is in',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      try {
        const groups = await sock.groupFetchAllParticipating();
        const list = Object.values(groups || {});
        if (!list.length) {
          return sock.sendMessage(chatId, { text: buildHint('Not in any groups yet') }, { quoted: fake });
        }

        const botNum = (sock.user?.id || '').split(':')[0].split('@')[0];
        const botLidNum = (sock.user?.lid || '').split(':')[0].split('@')[0];
        const rows = list.map((g, i) => {
          const botP = (g.participants || []).find(p => {
            const pNum = (p.id || '').split('@')[0].split(':')[0];
            return pNum === botNum || (botLidNum && pNum === botLidNum);
          });
          const role = (botP?.admin === 'admin' || botP?.admin === 'superadmin') ? 'admin' : 'user';
          const state = g.announce ? 'closed' : 'open';
          return { idx: i + 1, name: g.subject || 'Unknown', members: (g.participants || []).length, role, state, id: g.id };
        });

        const fields = rows.map(r => [String(r.idx), `${r.name} — ${r.members} members, ${r.role}, ${r.state}`]);
        const sent = await sock.sendMessage(chatId, {
          text: buildFrame({ title: `My Groups (${list.length})`, fields, footer: 'Reply with a number for full details' })
        }, { quoted: fake, ...replyOpts() });

        if (!global.replyHandlers) global.replyHandlers = new Map();
        const handlerKey = sent?.key?.id;
        if (handlerKey) {
          global.replyHandlers.set(handlerKey, async (replyMsg) => {
            global.replyHandlers.delete(handlerKey);
            const replySender = replyMsg.key.participant || replyMsg.key.remoteJid;
        // NOTE: sender check intentionally removed — stanzaId match already
        // proves this is a genuine reply to this exact bot message; LID vs
        // phone-number JIDs for the same person cannot be reliably compared.
            const text = (replyMsg.message?.extendedTextMessage?.text || replyMsg.message?.conversation || '').trim();
            const idx = parseInt(text, 10);
            const row = rows[idx - 1];
            if (!row) return;
            await sendWithCopy(sock, chatId, {
              text: buildFrame({
                title: row.name,
                fields: [
                  ['Members', String(row.members)],
                  ['Bot role', row.role],
                  ['State', row.state],
                  ['ID', row.id],
                ],
              }),
              copyText: row.id,
              buttonLabel: 'Copy ID',
              quoted: fake,
            });
          });
          setTimeout(() => global.replyHandlers?.delete(handlerKey), 180000);
        }
      } catch (err) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
