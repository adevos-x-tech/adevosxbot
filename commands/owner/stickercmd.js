const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

function getMap() {
  return getSetting('stickerCommands', {});
}
function saveMap(map) {
  updateSetting('stickerCommands', map);
}

/** getStickerHash — a stable id for a sticker, from its fileSha256 */
function getStickerHash(stickerMsg) {
  const sha = stickerMsg?.fileSha256;
  if (!sha) return null;
  return Buffer.isBuffer(sha) ? sha.toString('base64') : Buffer.from(sha).toString('base64');
}

/** matchStickerCommand — returns the bound command name, or null */
function matchStickerCommand(stickerMsg) {
  const hash = getStickerHash(stickerMsg);
  if (!hash) return null;
  const map = getMap();
  return map[hash] || null;
}

const commands = [
  {
    name: 'stickercmd',
    category: 'owner',
    description: 'Bind a sticker to silently trigger a command',
    usage: 'Reply to a sticker with .stickercmd add <command> | .stickercmd remove <command> | .stickercmd list | .stickercmd clear',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const sub = (args[0] || '').toLowerCase();

      if (sub === 'list') {
        const map = getMap();
        const entries = Object.entries(map);
        if (!entries.length) return sock.sendMessage(chatId, { text: buildHint('No sticker commands bound yet') }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Sticker Commands', fields: entries.map(([hash, cmd], i) => [String(i + 1), cmd]) })
        }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'clear') {
        saveMap({});
        return sock.sendMessage(chatId, { text: buildHint('All sticker command bindings cleared') }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'remove') {
        const cmdName = (args[1] || '').toLowerCase();
        if (!cmdName) return sock.sendMessage(chatId, { text: buildHint('Usage: .stickercmd remove <command>') }, { quoted: fake });
        const map = getMap();
        const hash = Object.keys(map).find(h => map[h] === cmdName);
        if (!hash) return sock.sendMessage(chatId, { text: buildHint(`No sticker bound to "${cmdName}"`) }, { quoted: fake });
        delete map[hash];
        saveMap(map);
        return sock.sendMessage(chatId, { text: buildHint(`Removed sticker binding for "${cmdName}"`) }, { quoted: fake, ...replyOpts() });
      }

      if (sub === 'add') {
        const cmdName = (args[1] || '').toLowerCase();
        if (!cmdName) return sock.sendMessage(chatId, { text: buildHint('Usage: reply to a sticker with .stickercmd add <command>') }, { quoted: fake });
        if (!global.commands?.get(cmdName) && !global.aliases?.get(cmdName)) {
          return sock.sendMessage(chatId, { text: buildHint(`No such command: ${cmdName}`) }, { quoted: fake });
        }
        let msgContent = message.message || {};
        if (msgContent.ephemeralMessage) msgContent = msgContent.ephemeralMessage.message || {};
        if (msgContent.viewOnceMessageV2) msgContent = msgContent.viewOnceMessageV2.message || {};
        const quotedSticker = msgContent.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage
          || msgContent.extendedTextMessage?.contextInfo?.quotedMessage?.ephemeralMessage?.message?.stickerMessage;
        if (!quotedSticker) {
          return sock.sendMessage(chatId, { text: buildHint('Reply to the sticker you want to bind, with .stickercmd add <command>') }, { quoted: fake });
        }
        const hash = getStickerHash(quotedSticker);
        if (!hash) return sock.sendMessage(chatId, { text: buildHint('Could not read that sticker, try another one') }, { quoted: fake });
        const map = getMap();
        map[hash] = cmdName;
        saveMap(map);
        return sock.sendMessage(chatId, { text: buildHint(`Sticker bound to "${cmdName}" — send it anytime to run the command silently`) }, { quoted: fake, ...replyOpts() });
      }

      return sock.sendMessage(chatId, {
        text: buildFrame({
          title: 'Sticker Commands',
          fields: [['Bound', String(Object.keys(getMap()).length)]],
          commands: [
            'stickercmd add <command> (reply to a sticker)',
            'stickercmd remove <command>',
            'stickercmd list',
            'stickercmd clear',
          ],
        })
      }, { quoted: fake, ...replyOpts() });
    }
  }
];

commands.matchStickerCommand = matchStickerCommand;
module.exports = commands;
