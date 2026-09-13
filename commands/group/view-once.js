const { getBotName, createFakeContact, channelInfo } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const os = require('os');
const axios = require('axios');
const moment = require('moment-timezone');

/**
 * Extract the view-once media payload from a quoted message reply.
 * Handles all known Baileys v7 view-once wrapper formats:
 *   viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension
 * Also searches contextInfo across all common message types so that
 * typing just ".vv" (conversation type) is handled correctly.
 */
function extractViewOnce(message) {
  const msg = message.message || {};
  // Try every container that can carry contextInfo
  const contextInfo =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.audioMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    msg.stickerMessage?.contextInfo ||
    msg.buttonsResponseMessage?.contextInfo ||
    msg.templateButtonReplyMessage?.contextInfo ||
    msg.listResponseMessage?.contextInfo;

  const q = contextInfo?.quotedMessage;
  if (!q) return null;

  // Wrapper formats (all known Baileys versions)
  if (q.viewOnceMessage?.message) return q.viewOnceMessage.message;
  if (q.viewOnceMessageV2?.message) return q.viewOnceMessageV2.message;
  if (q.viewOnceMessageV2Extension?.message) return q.viewOnceMessageV2Extension.message;
  // Ephemeral wrapping a view-once
  const inner = q.ephemeralMessage?.message;
  if (inner?.viewOnceMessage?.message) return inner.viewOnceMessage.message;
  if (inner?.viewOnceMessageV2?.message) return inner.viewOnceMessageV2.message;

  // Direct viewOnce flag on media (newer WhatsApp format)
  if (q.imageMessage?.viewOnce === true) return q;
  if (q.videoMessage?.viewOnce === true) return q;
  if (q.audioMessage?.viewOnce === true) return q;

  return null;
}

/**
 * Download a view-once media payload and return { buffer, mediaType }.
 * Returns null when the payload has no recognised media key.
 */
async function downloadViewOnce(viewOnce) {
  const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
  const mediaType = Object.keys(viewOnce).find(k =>
    ['imageMessage', 'videoMessage', 'audioMessage'].includes(k)
  );
  if (!mediaType) return null;
  const stream = await downloadContentFromMessage(viewOnce[mediaType], mediaType.replace('Message', ''));
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return { buffer, mediaType, meta: viewOnce[mediaType] };
}


// Export helpers for use by main.js emoji reaction trigger

module.exports = {
  extractViewOnce,
  downloadViewOnce,
};
