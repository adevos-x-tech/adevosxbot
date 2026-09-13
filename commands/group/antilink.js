const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getChatData, updateChatData } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

const VALID_ACTIONS = ['delete', 'warn', 'kick'];

function getCfg(chatId) {
  const raw = getChatData(chatId, 'antilink', null);
  if (raw && typeof raw === 'object') return raw;
  return { enabled: false, action: 'delete', allowedLinks: [], trustedUsers: [], maxWarnings: 3 };
}
function saveCfg(chatId, cfg) {
  updateChatData(chatId, 'antilink', cfg);
}

module.exports = [
  {
    name: 'antilink',
    category: 'group',
    description: 'Auto-moderate links shared in the group',
    usage: '.antilink on/off | .antilink set warn/kick/delete | .antilink exclude <link|@user|number> | .antilink exclude list | .antilink exclude clear | .antilink exclude remove <link|@user|number>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
      }

      const cfg = getCfg(chatId);
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'on') {
        cfg.enabled = true; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antilink turned ON') }, { quoted: fake, ...replyOpts() });
      }
      if (sub === 'off') {
        cfg.enabled = false; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint('Antilink turned OFF') }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antilink set warn/kick/delete') }, { quoted: fake });
        }
        cfg.action = action; saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Antilink action set to ${action}`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'exclude') {
        const sub2 = (args[1] || '').toLowerCase();

        if (sub2 === 'list') {
          const links = cfg.allowedLinks || [];
          const users = cfg.trustedUsers || [];
          if (!links.length && !users.length) {
            return sock.sendMessage(chatId, { text: buildHint('No links or users are excluded yet') }, { quoted: fake });
          }
          const fields = [];
          links.forEach(l => fields.push(['Link', l]));
          users.forEach(u => fields.push(['Trusted user', `@${u}`]));
          return sock.sendMessage(chatId, {
            text: buildFrame({ title: 'Antilink Exclusions', fields }),
            mentions: users.map(u => `${u}@s.whatsapp.net`),
          }, { quoted: fake, ...replyOpts() });
        }

        if (sub2 === 'clear') {
          cfg.allowedLinks = []; cfg.trustedUsers = []; saveCfg(chatId, cfg);
          return sock.sendMessage(chatId, { text: buildHint('All antilink exclusions cleared') }, { quoted: fake, ...replyOpts() });
        }

        if (sub2 === 'remove') {
          const { targets } = resolveTargets(message, args.slice(2));
          if (targets.length) {
            const num = targets[0].split('@')[0];
            cfg.trustedUsers = (cfg.trustedUsers || []).filter(u => u !== num);
            saveCfg(chatId, cfg);
            return sock.sendMessage(chatId, { text: buildHint(`Removed @${num} from trusted users`), mentions: targets }, { quoted: fake, ...replyOpts() });
          }
          const link = args.slice(2).join(' ').trim();
          cfg.allowedLinks = (cfg.allowedLinks || []).filter(l => l !== link);
          saveCfg(chatId, cfg);
          return sock.sendMessage(chatId, { text: buildHint(`Removed exclusion: ${link}`) }, { quoted: fake, ...replyOpts() });
        }

        // .antilink exclude <link | @user | number | reply>
        const { targets } = resolveTargets(message, args.slice(1));
        if (targets.length) {
          const num = targets[0].split('@')[0];
          cfg.trustedUsers = [...new Set([...(cfg.trustedUsers || []), num])];
          saveCfg(chatId, cfg);
          return sock.sendMessage(chatId, { text: buildHint(`@${num} added as a trusted user (their links are now allowed)`), mentions: targets }, { quoted: fake, ...replyOpts() });
        }
        const link = args.slice(1).join(' ').trim();
        if (!link) {
          return sock.sendMessage(chatId, { text: buildHint('Usage: .antilink exclude <link | @user | number>') }, { quoted: fake });
        }
        cfg.allowedLinks = [...new Set([...(cfg.allowedLinks || []), link])];
        saveCfg(chatId, cfg);
        return sock.sendMessage(chatId, { text: buildHint(`Excluded link: ${link}`) }, { quoted: fake, ...replyOpts() });
      }

      // No sub-command → status
      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Antilink',
          fields: [
            ['Current', cfg.enabled ? 'On' : 'Off'],
            ['Action', cfg.action || 'delete'],
          ],
          commands: [
            'antilink on/off',
            'antilink set warn/kick/delete',
            'antilink exclude <link|@user|number>',
            'antilink exclude list',
            'antilink exclude remove <link|@user|number>',
            'antilink exclude clear',
          ],
          footer: 'Reply with numbers Or Use specific commands',
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];
