const { getChatData, updateChatData, getSetting } = require('../AdevosAuth/database');
const { resolvePhoneFromLid, isLidJid } = require('../AdevosAuth/lidResolver');

const WARN_KEY = 'warnings';

/**
 * _num — normalizes a JID to a stable storage key. Modern WhatsApp often
 * reports the SAME person as a @lid JID in one event and a phone-number
 * JID in another (e.g. mention vs. group-metadata vs. reply). Without
 * normalization, each warning would land under a different key for the
 * same person, making the count look stuck at 1.
 */
function _num(jid) {
  const raw = (jid || '').split('@')[0].split(':')[0];
  if (isLidJid(jid)) {
    const resolved = resolvePhoneFromLid(jid);
    if (resolved && /^\d{7,15}$/.test(resolved)) return resolved;
  }
  return raw;
}

function getWarnLimit(chatId) {
  return getChatData(chatId, 'warnLimit', getSetting('warnLimit', 3));
}

function setWarnLimit(chatId, limit) {
  updateChatData(chatId, 'warnLimit', limit);
}

function getAllWarnings(chatId) {
  return getChatData(chatId, WARN_KEY, {});
}

/** addWarning — returns { count, limit, kicked } */
function addWarning(chatId, jid, reason) {
  const num = _num(jid);
  const all = getAllWarnings(chatId);
  const entry = all[num] || { count: 0, reason: '' };
  entry.count += 1;
  entry.reason = reason || entry.reason || 'No reason given';
  entry.lastAt = Date.now();
  all[num] = entry;
  updateChatData(chatId, WARN_KEY, all);
  const limit = getWarnLimit(chatId);
  const kicked = entry.count >= limit;
  if (kicked) {
    delete all[num];
    updateChatData(chatId, WARN_KEY, all);
  }
  return { count: entry.count, limit, kicked };
}

function resetWarning(chatId, jid) {
  const num = _num(jid);
  const all = getAllWarnings(chatId);
  delete all[num];
  updateChatData(chatId, WARN_KEY, all);
}

function resetAllWarnings(chatId) {
  updateChatData(chatId, WARN_KEY, {});
}

/** listWarned — [{ num, count, reason }], sorted highest count first */
function listWarned(chatId) {
  const all = getAllWarnings(chatId);
  return Object.entries(all)
    .map(([num, v]) => ({ num, count: v.count, reason: v.reason }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  getWarnLimit,
  setWarnLimit,
  getAllWarnings,
  addWarning,
  resetWarning,
  resetAllWarnings,
  listWarned,
};
