'use strict';
// lib/newsletterReact.js — utility helpers only.
// handleNewsletterMessage moved to lib/case.js.
const fs = require('fs');
const path = require('path');
const { getSetting, updateSetting } = require('../AdevosAuth/database');

const CHANNELS_FILE = path.join(__dirname, '../data/mychannels.json');
const EMOJIS = ['❤️', '💛', '👍', '💜', '😮', '🤍', '💙', '🔥', '🎉', '😂'];

function randomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function readConfig() {
  try {
    const raw = getSetting('newsletterreact', null);
    if (raw && typeof raw === 'object') return { enabled: true, ...raw };
    return { enabled: true };
  } catch { return { enabled: true }; }
}

function writeConfig(cfg) {
  try { updateSetting('newsletterreact', cfg); return true; }
  catch { return false; }
}

function loadChannels() {
  try {
    if (!fs.existsSync(CHANNELS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveChannels(list) {
  try {
    const dir = path.dirname(CHANNELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

module.exports = { readConfig, writeConfig, loadChannels, saveChannels, randomEmoji };
