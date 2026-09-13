'use strict';

const { ButtonV2 } = require('@whiskeysockets/baileys');

function normalizeId(id, fallback = '') {
  return typeof id === 'string' ? id : fallback;
}

function normalizeRows(rows = [], prefix = '.') {
  return rows
    .filter(row => row && (row.title || row.header) && row.id)
    .map(row => ({
      title: String(row.title || row.header).slice(0, 24),
      description: row.description ? String(row.description).slice(0, 72) : undefined,
      rowId: normalizeId(row.id, `${prefix}menu`),
    }));
}

function commandSections(categories = {}, prefix = '.') {
  const sections = [];
  for (const [category, commandNames] of Object.entries(categories)) {
    const rows = [...new Set((commandNames || []).filter(Boolean))]
      .sort()
      .map(name => ({
        title: String(name).slice(0, 24),
        description: `Run ${prefix}${name}`.slice(0, 72),
        rowId: `${prefix}${name}`,
      }));
    if (!rows.length) continue;
    // WhatsApp clients impose practical list-size limits. Keep each section
    // readable while retaining every category in the generated menu.
    for (let i = 0; i < rows.length; i += 10) {
      sections.push({
        title: i ? `${category} ${Math.floor(i / 10) + 1}` : String(category).slice(0, 24),
        rows: rows.slice(i, i + 10),
      });
    }
  }
  return sections;
}

async function sendList(sock, chatId, {
  text = '',
  footer = '',
  buttonText = 'Open List',
  sections = [],
  prefix = '.',
  mentions,
  quoted,
  ...options
} = {}) {
  const payload = {
    text,
    footer,
    buttonText,
    sections: sections.map(section => ({
      title: String(section.title || 'Options').slice(0, 24),
      rows: normalizeRows(section.rows, prefix),
    })).filter(section => section.rows.length),
    ...(mentions?.length ? { mentions } : {}),
    ...options,
  };
  if (!payload.sections.length) return sock.sendMessage(chatId, { text }, quoted ? { quoted } : undefined);
  return sock.sendMessage(chatId, payload, quoted ? { quoted } : undefined);
}

async function sendButtonV2(sock, chatId, {
  title = '',
  body = '',
  footer = '',
  buttons = [],
  thumbnail,
  mentions = [],
  quoted,
  userJid,
  ...options
} = {}) {
  try {
    const builder = new ButtonV2(sock)
      .setTitle(String(title || ''))
      .setBody(String(body || ''))
      .setFooter(String(footer || ''));
    if (thumbnail) builder.setThumbnail(thumbnail);
    for (const button of buttons.filter(Boolean).slice(0, 3)) {
      builder.addButton(String(button.text || button.displayText || button.title || 'Open').slice(0, 20), normalizeId(button.id));
    }
    if (!builder._buttons?.length && !buttons.length) {
      throw new Error('At least one button is required');
    }
    return await builder.send(chatId, {
      ...options,
      mentions,
      userJid: userJid || sock.user?.id || '',
      ...(quoted ? { quoted } : {}),
    });
  } catch (error) {
    if (process.env.DEBUG_INTERACTIVE) console.error('[Adevos X Bot] ButtonV2 fallback:', error.message);
    return sock.sendMessage(chatId, { text: body }, quoted ? { quoted } : undefined);
  }
}

async function sendInteractive(sock, chatId, {
  text = '',
  title = '',
  subtitle = '',
  footer = '',
  buttons = [],
  contextInfo,
  mentions,
  quoted,
  ...options
} = {}) {
  const interactiveButtons = buttons.map(button => ({
    ...button,
    name: button.name || 'quick_reply',
    buttonParamsJson: typeof button.buttonParamsJson === 'string'
      ? button.buttonParamsJson
      : JSON.stringify(button.params || { display_text: button.text || 'Open', id: button.id || '' }),
  }));
  const payload = {
    text,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(footer ? { footer } : {}),
    interactiveButtons,
    ...(contextInfo ? { contextInfo } : {}),
    ...(mentions?.length ? { mentions } : {}),
    ...options,
  };
  try {
    return await sock.sendMessage(chatId, payload, quoted ? { quoted } : undefined);
  } catch (error) {
    return sock.sendMessage(chatId, { text }, quoted ? { quoted } : undefined);
  }
}

function unwrapMessage(message) {
  let current = message?.message || message || {};
  const wrappers = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'deviceSentMessage'];
  for (let i = 0; i < 5; i++) {
    const type = wrappers.find(name => current?.[name]?.message);
    if (!type) break;
    current = current[type].message;
  }
  return current || {};
}

function parseNativeFlowParams(paramsJson) {
  if (!paramsJson) return {};
  if (typeof paramsJson === 'object') return paramsJson;
  try { return JSON.parse(paramsJson); } catch { return {}; }
}

function extractInteractionText(message) {
  const current = unwrapMessage(message);
  const type = Object.keys(current)[0] || 'unknown';
  const msg = current[type] || {};
  let text = '';
  let interactionType = type;

  if (type === 'listResponseMessage') {
    text = msg.singleSelectReply?.selectedRowId || msg.singleSelectReply?.selectedDisplayText || '';
  } else if (type === 'buttonsResponseMessage') {
    text = msg.selectedButtonId || msg.selectedDisplayText || '';
  } else if (type === 'templateButtonReplyMessage') {
    text = msg.selectedId || msg.selectedDisplayText || '';
  } else if (type === 'interactiveResponseMessage') {
    const params = parseNativeFlowParams(msg.nativeFlowResponseMessage?.paramsJson);
    text = params.id || params.row_id || params.selected_id || params.selectedRowId || msg.nativeFlowResponseMessage?.selectedId || '';
  } else if (type === 'conversation') {
    text = current.conversation || '';
  } else {
    text = msg.text || msg.caption || current.conversation || msg.contentText || msg.selectedDisplayText || msg.title || '';
  }

  return { text: typeof text === 'string' ? text.trim() : '', type, interactionType, message: current, payload: msg };
}

function commandButton(text, id) {
  return { text, id };
}

/**
 * copyButton — a native "Copy" button (WhatsApp's cta_copy flow) for use
 * with sendInteractive()'s `buttons` array. Tapping it copies `code` to
 * the user's clipboard without sending anything back to the chat.
 */
function copyButton(displayText, code) {
  return {
    name: 'cta_copy',
    params: { display_text: displayText || 'Copy', copy_code: String(code || '') },
  };
}

/**
 * sendWithCopy — convenience wrapper: send text with a single Copy button
 * attached, falling back to plain text if the interactive message fails.
 */
async function sendWithCopy(sock, chatId, { text = '', copyText = '', buttonLabel = 'Copy', quoted, mentions } = {}) {
  const { replyOpts } = require('./frame');
  if (!copyText) return sock.sendMessage(chatId, { text, ...replyOpts() }, quoted ? { quoted } : undefined);
  try {
    return await sendInteractive(sock, chatId, {
      text,
      buttons: [copyButton(buttonLabel, copyText)],
      quoted,
      mentions,
      ...replyOpts(),
    });
  } catch (_) {
    return sock.sendMessage(chatId, { text, ...replyOpts() }, quoted ? { quoted } : undefined);
  }
}

module.exports = {
  commandButton,
  copyButton,
  sendWithCopy,
  extractInteractionText,
  commandSections,
  normalizeRows,
  sendButtonV2,
  sendInteractive,
  sendList,
};
