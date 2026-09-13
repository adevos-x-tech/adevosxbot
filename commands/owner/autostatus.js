const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

const _AS_CFG_DEFAULT = { viewOn: true, reactOn: false, replyOn: false, replyText: 'Seen your status!', reactionEmoji: '❤', randomReactions: true };

function _asReadConfig() {
  try {
    const raw = getSetting('autostatusConfig', null);
    if (raw && typeof raw === 'object') return { ..._AS_CFG_DEFAULT, ...raw };
    return {
      viewOn: getSetting('autoviewstatus', true),
      reactOn: getSetting('autostatusreact', false),
      replyOn: getSetting('autostatusreply', false),
      replyText: getSetting('autostatusreplytext', _AS_CFG_DEFAULT.replyText),
      reactionEmoji: getSetting('autostatusemoji', '❤'),
      randomReactions: getSetting('autostatusrandom', true),
    };
  } catch { return { ..._AS_CFG_DEFAULT }; }
}
function _asWriteConfig(cfg) { try { updateSetting('autostatusConfig', cfg); return true; } catch { return false; } }

module.exports = [
{
    name: 'autostatus',
    aliases: ['autoview'],
    category: 'owner',
    description: 'Auto view/react/reply to WhatsApp statuses',
    usage: '.autostatus [on|off|view|react|reply|reset]',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const cfg = _asReadConfig();
      const sub = (args[0] || '').toLowerCase();

      if (!sub || sub === 'status') {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Auto Status',
            fields: [
              ['View', cfg.viewOn ? 'On' : 'Off'],
              ['React', cfg.reactOn ? 'On' : 'Off'],
              ['Reply', cfg.replyOn ? 'On' : 'Off'],
              ['Random react', cfg.randomReactions ? 'On' : 'Off'],
              ['Emoji', cfg.reactionEmoji],
              ['Reply text', cfg.replyText],
            ],
            commands: [
              'autostatus on/off', 'autostatus view on/off', 'autostatus react on/off',
              'autostatus reply on/off', 'autostatus setemoji <emoji>', 'autostatus setreply <text>',
              'autostatus random on/off', 'autostatus reset',
            ],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'on') { _asWriteConfig({ ...cfg, viewOn: true }); return sock.sendMessage(chatId, { text: buildHint('Auto Status enabled') }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'off') { _asWriteConfig({ ...cfg, viewOn: false, reactOn: false, replyOn: false }); return sock.sendMessage(chatId, { text: buildHint('Auto Status disabled') }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'reset') {
        _asWriteConfig({ ..._AS_CFG_DEFAULT });
        return sock.sendMessage(chatId, { text: buildHint('Auto Status reset to defaults') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'view') { const on = (args[1] || '').toLowerCase() !== 'off'; _asWriteConfig({ ...cfg, viewOn: on }); return sock.sendMessage(chatId, { text: buildHint(`View: ${on ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'react') { const on = (args[1] || '').toLowerCase() !== 'off'; _asWriteConfig({ ...cfg, reactOn: on }); return sock.sendMessage(chatId, { text: buildHint(`React: ${on ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'reply') { const on = (args[1] || '').toLowerCase() !== 'off'; _asWriteConfig({ ...cfg, replyOn: on }); return sock.sendMessage(chatId, { text: buildHint(`Reply: ${on ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'random') { const on = (args[1] || '').toLowerCase() !== 'off'; _asWriteConfig({ ...cfg, randomReactions: on }); return sock.sendMessage(chatId, { text: buildHint(`Random reactions: ${on ? 'On' : 'Off'}`) }, { quoted: fake, ...replyOpts() }); }
      if (sub === 'setemoji') {
        if (!args[1]) return sock.sendMessage(chatId, { text: buildHint('Usage: .autostatus setemoji ❤') }, { quoted: fake });
        _asWriteConfig({ ...cfg, reactionEmoji: args[1] });
        return sock.sendMessage(chatId, { text: buildHint(`Reaction emoji set to ${args[1]}`) }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'setreply') {
        const text = args.slice(1).join(' ');
        if (!text) return sock.sendMessage(chatId, { text: buildHint('Usage: .autostatus setreply <text>') }, { quoted: fake });
        _asWriteConfig({ ...cfg, replyText: text });
        return sock.sendMessage(chatId, { text: buildHint(`Reply text set to: ${text}`) }, { quoted: fake, ...replyOpts() });
      }
      return sock.sendMessage(chatId, { text: buildHint('Unknown sub-command', 'Use: .autostatus status') }, { quoted: fake });
    }
  }
];
