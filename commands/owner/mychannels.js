const fs = require('fs');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'mychannels',
    aliases: ['channels', 'mychans'],
    category: 'owner',
    description: 'Manage newsletter channels for auto-react',
    usage: '.mychannels [list|add <jid>|remove <jid>|clear]',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const _mcPath = require('path').join(__dirname, '../../data/mychannels.json');

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const loadChannels = () => {
        try { return JSON.parse(fs.readFileSync(_mcPath, 'utf-8')); } catch { return []; }
      };
      const saveChannels = (arr) => fs.writeFileSync(_mcPath, JSON.stringify([...new Set(arr)], null, 2));

      const sub = (args[0] || 'list').toLowerCase();

      if (sub === 'list' || !sub) {
        const list = loadChannels();
        if (!list.length) return sock.sendMessage(chatId, { text: buildHint('No channels saved') }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'My Channels', fields: list.map((j, i) => [String(i + 1), j]).concat([['Total', String(list.length)]]) })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'add') {
        const jid = args[1]?.trim();
        if (!jid || !jid.endsWith('@newsletter')) {
          return sock.sendMessage(chatId, { text: buildHint('Provide a valid newsletter JID', '.mychannels add 120363XXXXXX@newsletter') }, { quoted: fake });
        }
        const list = loadChannels();
        if (list.includes(jid)) return sock.sendMessage(chatId, { text: buildHint(`Already in list: ${jid}`) }, { quoted: fake });
        list.push(jid);
        saveChannels(list);
        return sock.sendMessage(chatId, { text: buildHint(`Added: ${jid}`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'remove' || sub === 'del') {
        const jid = args[1]?.trim();
        if (!jid) return sock.sendMessage(chatId, { text: buildHint('Provide the JID to remove') }, { quoted: fake });
        const list = loadChannels().filter(j => j !== jid);
        saveChannels(list);
        return sock.sendMessage(chatId, { text: buildHint(`Removed: ${jid}`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'clear') {
        saveChannels([]);
        return sock.sendMessage(chatId, { text: buildHint('Channel list cleared') }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({ title: 'My Channels', commands: ['mychannels list', 'mychannels add <jid>', 'mychannels remove <jid>', 'mychannels clear'] })
      }, { quoted: fake });
    }
  }
];
