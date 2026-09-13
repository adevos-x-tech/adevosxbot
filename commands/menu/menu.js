const { getSetting } = require('../../AdevosAuth/database');
const { getBotName, getBotStyle, createFakeContact } = require('../../Adevoslib/messageConfig');
const { replyOpts, frameTop, frameField, frameFooterLabel, frameClose } = require('../../Adevoslib/frame');
const { isLidJid, resolvePhoneFromLid } = require('../../AdevosAuth/lidResolver');
const { getCurrentTime, getCurrentTimezone } = require('../../Adevoslib/myfunc');
const { getMenuMedia } = require('../owner/setmenuimage');
const os = require('os');

const more = String.fromCharCode(8206);
const readmore = more.repeat(4001);

// Only 4 menu styles per spec — the header/info block is shared by all of
// them, they differ only in how commands are shown.
//   1 = Plain text, full command list, expandable via WhatsApp "read more"
//   2 = Same as 3, but with a picture attached
//   3 = Plain text, categories listed only — reply with a number to browse
//   4 = Text + image, full command list (same layout as 1, with an image)
const MENU_STYLES = {
  '1': 'Plain text (full list, read more)',
  '2': 'Categories + picture (reply to browse)',
  '3': 'Categories only (reply to browse)',
  '4': 'Image + caption (full list)',
};

function formatUptime() {
  let s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600);  s %= 3600;
  const m = Math.floor(s / 60);    s %= 60;
  let t = '';
  if (d) t += `${d}d `;
  if (h) t += `${h}h `;
  if (m) t += `${m}m `;
  t += `${s}s`;
  return t.trim();
}

function progressBar(used, total, size = 10) {
  const pct = Math.round((used / total) * size);
  return '█'.repeat(pct) + '░'.repeat(size - pct) + ` ${Math.round((used / total) * 100)}%`;
}

function resolveMentionTag(senderId, pushname) {
  let senderPhone = senderId ? senderId.split('@')[0].split(':')[0].replace(/\D/g, '') : '';
  let mentionJid = senderId || '';
  if (senderId && isLidJid(senderId)) {
    const resolved = resolvePhoneFromLid(senderId);
    if (resolved && resolved.length <= 15) {
      senderPhone = resolved;
      mentionJid = `${resolved}@s.whatsapp.net`;
    } else {
      senderPhone = '';
      mentionJid = senderId;
    }
  }
  const mentionTag = senderPhone ? `@${senderPhone}` : (pushname || 'User');
  return { mentionTag, mentionJid: senderPhone ? mentionJid : '' };
}

function buildHeader(pushname, ping, senderId) {
  const prefix  = getSetting('prefix', '.');
  const botName = getBotName();
  const owner   = getSetting('botOwner', 'Adevos');
  const version = global.version || '3.0.0';
  const mode    = global.mode || getSetting('mode', 'public');
  const platform = getSetting('platform', null) || (
    process.env.HEROKU_APP_NAME || process.env.DYNO ? 'Heroku' :
    process.env.RAILWAY_ENVIRONMENT ? 'Railway' :
    process.env.RENDER ? 'Render' :
    process.env.KOYEB_APP_NAME ? 'Koyeb' :
    process.env.REPL_ID ? 'Replit' :
    process.env.FLY_APP_NAME ? 'Fly.io' :
    (process.env.PTERODACTYL_SERVER_UUID || process.env.SERVER_UUID) ? 'Pterodactyl VPS' :
    'VPS/Local'
  );
  const botStyle = getBotStyle() === 'forwarded' ? 'Forwarded' : 'Normal';
  const menuStyle = ['1','2','3','4'].includes(String(getSetting('menustyle', '1'))) ? String(getSetting('menustyle', '1')) : '1';
  const uptime  = formatUptime();
  const totalMem = os.totalmem();
  const usedMem  = totalMem - os.freemem();
  const ram = progressBar(usedMem, totalMem);
  const tz = getCurrentTimezone();
  const timeShort = getCurrentTime('time');

  const tzHour = parseInt(timeShort.split(':')[0], 10);
  let greeting = 'Hey there !';
  if (tzHour >= 5 && tzHour < 12) greeting = 'Hey there !';
  else if (tzHour >= 12 && tzHour < 17) greeting = 'Hey there !';
  else if (tzHour >= 17 && tzHour < 21) greeting = 'Hey there !';
  else greeting = 'Hey there !';

  const { mentionTag, mentionJid } = resolveMentionTag(senderId, pushname);

  const info = [
    ['𝐎𝐰𝐧𝐞𝐫', owner],
    ['𝐏𝐫𝐞𝐟𝐢𝐱', prefix],
    ['𝐏𝐥𝐚𝐭𝐟𝐨𝐫𝐦', platform],
    ['𝐁𝐨𝐭 𝐦𝐨𝐝𝐞', mode],
    ['𝐁𝐨𝐭 𝐒𝐭𝐲𝐥𝐞', botStyle],
    ['𝐌𝐞𝐧𝐮 𝐬𝐭𝐲𝐥𝐞', menuStyle],
    ['𝐕𝐞𝐫𝐬𝐢𝐨𝐧', `v${version}`],
    ['𝐒𝐩𝐞𝐞𝐝 ', `${ping}ms`],
    ['𝐑𝐀𝐌', ram],
  ];

  let header = `*${greeting},* ${mentionTag}\n\n`;
  header += frameTop(botName) + '\n';
  header += info.map(([label, value]) => frameField(label, value)).join('\n') + '\n';
  header += frameClose() + '\n';

  return { header, mentionJid };
}

function sortedCategories() {
  const categories = global.fileCategories || {};
  const catKeys = Object.keys(categories);
  return [
    ...(['owner'].filter(c => catKeys.includes(c))),
    ...catKeys.filter(c => c !== 'owner' && c !== 'menu').sort(),
    ...(['menu'].filter(c => catKeys.includes(c))),
  ];
}

// Styles 1 & 4 — full command list under the header, wrapped in "read more"
function buildFullListText(pushname, ping, senderId) {
  const prefix = getSetting('prefix', '.');
  const { header, mentionJid } = buildHeader(pushname, ping, senderId);
  const categories = global.fileCategories || {};

  let body = header + readmore + '\n';
  for (const cat of sortedCategories()) {
    const cmds = (categories[cat] || []).sort();
    if (!cmds.length) continue;
    body += frameTop(cat.toUpperCase()) + '\n';
    for (const cmd of cmds) body += `│ ${prefix}${cmd}\n`;
    body += frameClose() + '\n';
    body += readmore + '\n';
  }
  return { text: body, mentionJid };
}

// Styles 2 & 3 — header + numbered category list only; user replies with a
// number to see that category's commands.
function buildCategoryListText(pushname, ping, senderId) {
  const { header, mentionJid } = buildHeader(pushname, ping, senderId);
  const cats = sortedCategories();

  let body = header + '\n';
  body += frameTop('CATEGORIES') + '\n';
  cats.forEach((cat, i) => {
    body += `│ ${i + 1}. ${cat.toUpperCase()}\n`;
  });
  body += frameClose() + '\n';
  body += `\n_Reply with a category number to see its commands_`;
  return { text: body, mentionJid, cats };
}

function buildCategoryCommandsText(cat) {
  const botName = getBotName();
  const categories = global.fileCategories || {};
  const cmds = (categories[cat] || []).sort();
  let body = frameTop(cat.toUpperCase()) + '\n';
  for (const cmd of cmds) body += `│ ${cmd}\n`;
  body += frameClose() + '\n';
  return body;
}

function registerCategoryReplyHandler(sentId, senderId, chatId, sock, fake, cats) {
  if (!sentId) return;
  if (!global.replyHandlers) global.replyHandlers = new Map();
  global.replyHandlers.set(sentId, async (replyMsg) => {
    global.replyHandlers.delete(sentId);
    const replySender = replyMsg.key.participant || replyMsg.key.remoteJid;
        // NOTE: sender check intentionally removed — stanzaId match already
        // proves this is a genuine reply to this exact bot message; LID vs
        // phone-number JIDs for the same person cannot be reliably compared.
    const text = (replyMsg.message?.extendedTextMessage?.text || replyMsg.message?.conversation || '').trim();
    const idx = parseInt(text, 10);
    const cat = cats[idx - 1];
    if (!cat) return;
    await sock.sendMessage(chatId, { text: buildCategoryCommandsText(cat), ...replyOpts() }, { quoted: fake });
  });
  setTimeout(() => global.replyHandlers?.delete(sentId), 180000);
}

async function loadMediaBuffer() {
  const media = getMenuMedia?.();
  if (media?.buffer) return media;
  if (media?.url) return media;
  return { type: 'image', url: '' };
}

async function sendMenu(sock, chatId, message, style, pushname, senderId, ping) {
  const fake = createFakeContact(message);
  const botName = getBotName();

  if (style === '3') {
    const { text, mentionJid, cats } = buildCategoryListText(pushname, ping, senderId);
    const sent = await sock.sendMessage(chatId, {
      text, mentions: mentionJid ? [mentionJid] : [], ...replyOpts(),
    }, { quoted: fake });
    registerCategoryReplyHandler(sent?.key?.id, senderId, chatId, sock, fake, cats);
    return;
  }

  if (style === '2') {
    const { text, mentionJid, cats } = buildCategoryListText(pushname, ping, senderId);
    const media = await loadMediaBuffer();
    const imagePayload = media.buffer ? { image: media.buffer } : { image: { url: media.url || 'https://files.catbox.moe/br0css.jpg' } };
    const sent = await sock.sendMessage(chatId, {
      ...imagePayload, caption: text, mentions: mentionJid ? [mentionJid] : [], ...replyOpts(),
    }, { quoted: fake });
    registerCategoryReplyHandler(sent?.key?.id, senderId, chatId, sock, fake, cats);
    return;
  }

  if (style === '4') {
    const { text, mentionJid } = buildFullListText(pushname, ping, senderId);
    const media = await loadMediaBuffer();
    const imagePayload = media.buffer ? { image: media.buffer } : { image: { url: media.url || 'https://files.catbox.moe/br0css.jpg' } };
    await sock.sendMessage(chatId, {
      ...imagePayload, caption: text, mentions: mentionJid ? [mentionJid] : [], ...replyOpts(),
    }, { quoted: fake });
    return;
  }

  // Style 1 (default) — plain text, full list, read-more
  const { text, mentionJid } = buildFullListText(pushname, ping, senderId);
  await sock.sendMessage(chatId, { text, mentions: mentionJid ? [mentionJid] : [], ...replyOpts() }, { quoted: fake });
}

module.exports = [
  {
    name: 'menu',
    aliases: ['commands', 'help', 'list', 'm', 'fullmenu', 'start'],
    category: 'menu',
    description: 'Show all bot commands',
    execute: async (sock, message, args, context) => {
      try {
        const { chatId, senderId } = context;
        const pushname = message.pushName || context?.pushName || '';
        const style = ['1','2','3','4'].includes(String(getSetting('menustyle', '1'))) ? String(getSetting('menustyle', '1')) : '1';

        const pingStart = Date.now();
        await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        const ping = Date.now() - pingStart;

        await sendMenu(sock, chatId, message, style, pushname, senderId, ping);
      } catch (err) {
        console.error('[Adevos X Bot] Menu error:', err.message);
        await context.reply('Error generating menu. Please try again.').catch(() => {});
      }
    }
  }
];
