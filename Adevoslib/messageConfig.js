const { getSetting } = require('../AdevosAuth/database');

// Legacy static export — kept for any file that still does
// `const { channelInfo } = require('.../messageConfig')` and spreads it
// directly. New code should prefer getChannelInfo() below, which reacts
// to the Bot Style setting (Normal vs Forwarded) instead of always
// forcing forwardingScore/isForwarded on.
const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
  }
};

const DEFAULT_FORWARDED_CHANNEL = 'Adevos-X Tech Official';
const DEFAULT_FOOTER = '𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐀𝐝𝐞𝐯𝐨𝐬-𝐗 𝐓𝐞𝐜𝐡 ⓒ';

function getBotName() {
  return global.botName || getSetting('botName', 'Adevos X Bot');
}

function getOwnerName() {
  return global.botOwner || getSetting('botOwner', 'Not set!');
}

function getMenuImage() {
  return getSetting('menuimage', '');
}

/**
 * getBotStyle — 'normal' | 'forwarded'
 * Normal: replies render as plain messages.
 * Forwarded: replies render as if forwarded many times from a channel
 * (see setforwardedchannel / botstyle.js command).
 */
function getBotStyle() {
  const style = String(getSetting('botstyle', 'normal') || 'normal').toLowerCase().trim();
  return style === 'forwarded' ? 'forwarded' : 'normal';
}

/**
 * getForwardedChannelName — the channel name shown when Bot Style is
 * Forwarded. Falls back to the bot's own name if nothing is set.
 */
function getForwardedChannelName() {
  const name = getSetting('forwardedChannelName', null);
  if (name === 'reset' || !name) return getBotName() || DEFAULT_FORWARDED_CHANNEL;
  return name;
}

/**
 * getChannelInfo — message options to spread into sock.sendMessage() so
 * the reply respects the current Bot Style. Use this instead of the
 * static `channelInfo` export for anything built after this change.
 */
function getChannelInfo() {
  if (getBotStyle() !== 'forwarded') return {};
  return {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363408344756821@newsletter',
        newsletterName: getForwardedChannelName(),
      },
    },
  };
}

/**
 * getFooter — the footer appended to bot replies (see footer.js command).
 * Returns '' when footers are turned off.
 */
function getFooter() {
  const enabled = getSetting('footerEnabled', true);
  if (!enabled) return '';
  const text = getSetting('footerText', null);
  return (text === null || text === '') ? `> ${DEFAULT_FOOTER}` : text;
}

function createFakeContact(msgOrId) {
  const botName = getBotName();
  let participantId;
  let realRemoteJid = null;
  let quotedText = null;

  if (msgOrId && typeof msgOrId === 'object' && msgOrId.key) {
    participantId = msgOrId.key.participant || msgOrId.key.remoteJid || '0';
    realRemoteJid = msgOrId.key.remoteJid || null;
    // Pull the actual text the user sent, so the reply preview shows
    // "replying to your command/message" instead of a fake contact card.
    quotedText = msgOrId.message?.conversation
      || msgOrId.message?.extendedTextMessage?.text
      || msgOrId.message?.imageMessage?.caption
      || msgOrId.message?.videoMessage?.caption
      || null;
  } else {
    participantId = msgOrId;
  }

  const cleanId = String(participantId || '0').split(':')[0].split('@')[0] || '0';
  const participantJid = (participantId && String(participantId).includes('@'))
    ? String(participantId).split(':')[0]
    : `${cleanId}@s.whatsapp.net`;

  return {
    key: {
      remoteJid: realRemoteJid || participantJid,
      participant: participantJid,
      fromMe: false,
      id: 'ADEVOS-X' + Math.random().toString(36).substring(2, 12).toUpperCase()
    },
    message: {
      conversation: quotedText || `Message sent to ${botName}`
    },
    participant: participantJid
  };
}

// Kept for any file still calling buildReplyBox() directly — now just
// forwards to frame.js's buildSimpleBox so no reply anywhere renders the
// old ┌─/└─ box style. Prefer requiring frame.js directly in new code.
function buildReplyBox(title, lines = []) {
  const { buildSimpleBox } = require('./frame');
  return buildSimpleBox(title, lines);
}

async function sendWithContact(sock, chatId, text, message) {
  const senderId = message?.key?.participant || message?.key?.remoteJid || '0';
  const fake = createFakeContact(message);
  return sock.sendMessage(chatId, { text, ...getChannelInfo() }, { quoted: fake });
}

module.exports = {
  channelInfo,
  getBotName,
  getOwnerName,
  getMenuImage,
  getBotStyle,
  getForwardedChannelName,
  getChannelInfo,
  getFooter,
  createFakeContact,
  buildReplyBox,
  sendWithContact,
};
