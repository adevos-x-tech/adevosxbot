const isAdmin = require('../../AdevosAuth/isAdmin');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

// action: 'announcement' = closed (admins only), 'not_announcement' = open
const _scheduled = new Map(); // groupId -> Timeout

function parseDuration(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d+)\s*(s|sec|m|min|h|hr|hour|d|day)s?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith('s') ? 1000
    : unit.startsWith('m') && !unit.startsWith('mo') ? 60000
    : unit.startsWith('h') ? 3600000
    : 86400000;
  return n * mult;
}

/**
 * runLock — shared executor for close/open (and their mute/unmute/lock/unlock aliases).
 * mode: 'close' | 'open'
 */
async function runLock(sock, message, args, context, mode) {
  const { chatId: currentChatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
  const botName = getBotName();
  const fake = createFakeContact(message);
  const inGroup = currentChatId.endsWith('@g.us');

  // Figure out target group id: explicit id arg, or current group.
  let targetId = currentChatId;
  let rest = [...args];
  if (rest[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(rest[0])) {
    targetId = rest.shift();
  } else if (!inGroup) {
    return sock.sendMessage(currentChatId, {
      text: buildHint(`Usage: .${mode} <group-id> [message]`, `.${mode} 12036...@g.us Doors closing`)
    }, { quoted: fake });
  }

  // Permission check (works even when called from outside the group)
  const perms = await isAdmin(sock, targetId, senderId).catch(() => ({ isSenderAdmin: false, isBotAdmin: false }));
  const senderOk = inGroup ? (isSenderAdmin || senderIsSudo) : (perms.isSenderAdmin || senderIsSudo);
  const botOk = inGroup ? isBotAdmin : perms.isBotAdmin;

  if (!senderOk) {
    return sock.sendMessage(currentChatId, { text: buildFrame({ title: botName, fields: [['Access', 'Admins only']] }) }, { quoted: fake });
  }
  if (!botOk) {
    return sock.sendMessage(currentChatId, { text: buildFrame({ title: botName, fields: [['Status', 'I need admin in that group']] }) }, { quoted: fake });
  }

  // .closetime / .opentime — schedule instead of acting now
  const scheduleArg = rest[0] && parseDuration(rest[0]) ? rest.shift() : null;

  const customMessage = rest.join(' ').trim();
  const settingValue = mode === 'close' ? 'announcement' : 'not_announcement';
  const defaultMsg = mode === 'close'
    ? 'Group is now closed — only admins can send messages.'
    : 'Group is now open — everyone can send messages.';

  const doAction = async () => {
    try {
      await sock.groupSettingUpdate(targetId, settingValue);
      await sock.sendMessage(targetId, {
        text: buildFrame({ title: botName, fields: [[mode === 'close' ? 'Closed' : 'Opened', customMessage || defaultMsg]] })
      }, { ...replyOpts() });
    } catch (e) {
      await sock.sendMessage(currentChatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
    }
  };

  if (scheduleArg) {
    const ms = parseDuration(scheduleArg);
    if (_scheduled.has(targetId)) clearTimeout(_scheduled.get(targetId));
    _scheduled.set(targetId, setTimeout(() => { _scheduled.delete(targetId); doAction(); }, ms));
    return sock.sendMessage(currentChatId, {
      text: buildHint(`Group will ${mode} in ${scheduleArg}`, customMessage || undefined)
    }, { quoted: fake, ...replyOpts() });
  }

  return doAction();
}

module.exports = { runLock, parseDuration };
