const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

// Detection/capture logic lives in ./events.js (storeMessage,
// handleMessageRevocation, handleMessagesDelete, handleMessageEdit) —
// this file is only the .antidelete toggle command, reading/writing the
// same 'antidelete' / 'antideletescope' settings that events.js checks.

module.exports = [
{
    name: 'antidelete',
    aliases: ['antidel'],
    category: 'owner',
    description: 'Recover deleted messages',
    usage: '.antidelete on/off/group/private/status',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const sub  = (args[0] || '').toLowerCase().trim();
      const sub2 = (args[1] || '').toLowerCase().trim(); // second word e.g. 'off'

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const _getDest  = () => String(getSetting('antidelete', 'private')     || 'private').toLowerCase();
      const _getScope = () => String(getSetting('antideletescope', 'all') || 'all').toLowerCase();
      const _destLabel  = d => ({ private: 'DM (owner)', on: 'DM (owner)', chat: 'Same chat', both: 'DM + same chat', off: 'Off' }[d] || d.toUpperCase());
      const _scopeLabel = s => ({ all: 'All chats', pm: 'DMs only', group: 'Groups only' }[s] || s.toUpperCase());

      // ── status ──────────────────────────────────────────────────────────
      if (!sub || sub === 'status') {
        const curDest  = _getDest();
        const curScope = _getScope();
        const isOn = curDest !== 'off';
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Anti-Delete',
            fields: [
              ['Status', isOn ? 'On' : 'Off'],
              ['Destination', _destLabel(curDest)],
              ['Scope', _scopeLabel(curScope)],
            ],
            commandsLabel: 'Commands',
            commands: [
              'antidelete private / on — DM',
              'antidelete chat — same chat',
              'antidelete both — DM + chat',
              'antidelete pm — DMs only',
              'antidelete pm off — remove DM-only filter',
              'antidelete group / gc — groups only',
              'antidelete group off — remove group-only filter',
              'antidelete all — all chats',
              'antidelete off — disable entirely',
            ],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      // ── DESTINATION commands ─────────────────────────────────────────────
      if (sub === 'private' || sub === 'on') {
        updateSetting('antidelete', 'private');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Anti-Delete', fields: [['Status', 'On'], ['Destination', 'DM (owner)'], ['Scope', _scopeLabel(_getScope())]] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'chat') {
        updateSetting('antidelete', 'chat');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Anti-Delete', fields: [['Status', 'On'], ['Destination', 'Same chat'], ['Scope', _scopeLabel(_getScope())]] })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'both') {
        updateSetting('antidelete', 'both');
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Anti-Delete', fields: [['Status', 'On'], ['Destination', 'DM + same chat'], ['Scope', _scopeLabel(_getScope())], ['Note', 'Sending to the same chat can risk a WhatsApp ban']] })
        }, { quoted: fake, ...replyOpts() });
      }

      // ── SCOPE commands ───────────────────────────────────────────────────
      if (sub === 'pm' && sub2 === 'off') {
        updateSetting('antideletescope', 'all');
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Anti-Delete', fields: [['Scope', 'All chats'], ['Destination', _destLabel(_getDest())]] }) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'pm') {
        updateSetting('antideletescope', 'pm');
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Anti-Delete', fields: [['Scope', 'DMs only'], ['Destination', _destLabel(_getDest())]] }) }, { quoted: fake, ...replyOpts() });
      }
      if ((sub === 'group' || sub === 'groups' || sub === 'gc') && sub2 === 'off') {
        updateSetting('antideletescope', 'all');
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Anti-Delete', fields: [['Scope', 'All chats'], ['Destination', _destLabel(_getDest())]] }) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'group' || sub === 'groups' || sub === 'gc') {
        updateSetting('antideletescope', 'group');
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Anti-Delete', fields: [['Scope', 'Groups only'], ['Destination', _destLabel(_getDest())]] }) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'all') {
        updateSetting('antideletescope', 'all');
        return sock.sendMessage(chatId, { text: buildFrame({ title: 'Anti-Delete', fields: [['Scope', 'All chats'], ['Destination', _destLabel(_getDest())]] }) }, { quoted: fake, ...replyOpts() });
      }

      // ── global off ───────────────────────────────────────────────────────
      if (sub === 'off') {
        updateSetting('antidelete', 'off');
        updateSetting('antideletescope', 'all');
        return sock.sendMessage(chatId, { text: buildHint('Anti-Delete disabled') }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Anti-Delete',
          commandsLabel: 'Commands',
          commands: [
            'antidelete private / on', 'antidelete chat', 'antidelete both',
            'antidelete pm', 'antidelete pm off',
            'antidelete group / gc', 'antidelete group off',
            'antidelete all', 'antidelete off', 'antidelete status',
          ],
        })
      }, { quoted: fake });
    }
  }
];
