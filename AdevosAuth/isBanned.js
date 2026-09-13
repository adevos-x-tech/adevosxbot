'use strict';

const { getCommandData, updateCommandData } = require('./database');

const BANNED_KEY = 'list';

function getBannedList() {
  const result = getCommandData('banned', BANNED_KEY, []);
  return Array.isArray(result) ? result : [];
}

function isBanned(jid) {
  if (!jid) return false;
  try {
    const list = getBannedList();
    const num = jid.split('@')[0].split(':')[0];
    return list.some(b => String(b).split('@')[0].split(':')[0] === num);
  } catch {
    return false;
  }
}

function addBan(jid) {
  const num = jid.split('@')[0].split(':')[0];
  const list = getBannedList();
  if (!list.includes(num)) {
    list.push(num);
    updateCommandData('banned', BANNED_KEY, list);
  }
}

function removeBan(jid) {
  const num = jid.split('@')[0].split(':')[0];
  const list = getBannedList().filter(b => String(b).split('@')[0].split(':')[0] !== num);
  updateCommandData('banned', BANNED_KEY, list);
}

module.exports = { isBanned, addBan, removeBan, getBannedList };
