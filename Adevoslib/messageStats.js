const fs = require('fs');
const path = require('path');

const _MC_PATH = path.join(__dirname, '../data/messageCount.json');

function _load() {
  try {
    if (fs.existsSync(_MC_PATH)) return JSON.parse(fs.readFileSync(_MC_PATH, 'utf8'));
  } catch (_) {}
  return { messageCount: {}, lastActive: {} };
}

function _save(d) {
  const dir = path.dirname(_MC_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(_MC_PATH, JSON.stringify(d, null, 2));
}

/**
 * incrementMessageCount — call this once per incoming group message.
 * Previously this exact function existed (unexported, uncalled) in
 * several command files — nothing in main.js/index.js ever invoked it,
 * so topmembers/getparticipants has always shown "no activity yet".
 */
function incrementMessageCount(groupId, userId) {
  const d = _load();
  if (!d.messageCount) d.messageCount = {};
  if (!d.messageCount[groupId]) d.messageCount[groupId] = {};
  d.messageCount[groupId][userId] = (d.messageCount[groupId][userId] || 0) + 1;
  if (!d.lastActive) d.lastActive = {};
  if (!d.lastActive[groupId]) d.lastActive[groupId] = {};
  d.lastActive[groupId][userId] = Date.now();
  _save(d);
}

function getGroupMessageCounts(groupId) {
  const d = _load();
  return (d.messageCount || {})[groupId] || {};
}

/**
 * getRecentlyActive — users who sent a message in the last `withinMs`
 * (default 10 minutes). This is an activity proxy, NOT true WhatsApp
 * presence — Baileys doesn't reliably expose bulk online status for
 * group members (it requires per-contact presence subscription and is
 * gated by each user's privacy settings), so "online" here means
 * "recently active in this chat".
 */
function getRecentlyActive(groupId, withinMs = 10 * 60 * 1000) {
  const d = _load();
  const group = (d.lastActive || {})[groupId] || {};
  const cutoff = Date.now() - withinMs;
  return Object.entries(group)
    .filter(([, ts]) => ts >= cutoff)
    .sort(([, a], [, b]) => b - a)
    .map(([uid, ts]) => ({ uid, lastSeen: ts }));
}

module.exports = { incrementMessageCount, getGroupMessageCounts, getRecentlyActive };
