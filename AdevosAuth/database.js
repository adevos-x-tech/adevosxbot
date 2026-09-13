'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const settings = require('../settings.js');

const USE_PG = !!(process.env.DATABASE_URL && /^postgre/i.test(process.env.DATABASE_URL));

// ============================================================
// DEFAULT SETTINGS
// ============================================================
const DEFAULT_SETTINGS = {
  botName: settings.botName || 'Adevos-X Bot',
  botOwner: settings.botOwner || 'Adevos',
  ownerNumber: settings.ownerNumber || '',
  prefix: settings.prefix || '.',
  mode: settings.mode || 'public',
  version: settings.version || '3.0.0',
  alwaysonline: 'false',
  antibug: 'false',
  anticall: 'false',
  autoread: 'false',
  autoreact: 'off',
  autobio: 'false',
  chatbot: 'off',
  chatbotpm: 'false',
  fontstyle: 'none',
  autoblock: 'false',
  autoemoji: 'off',
  autoviewstatus: 'true',
  autoreactstatus: 'false',
  statusantidelete: 'false',
  antiedit: 'off',
  antidelete: 'private',
  antideletescope: 'all',
  menustyle: '2',
  menuimage: 'https://files.catbox.moe/br0css.jpg',
  packname: settings.packname || 'Adevos-X Bot',
  author: settings.botOwner || 'Adevos',
  watermark: settings.watermark || 'Adevos-X Bot',
  anticallmsg: '',
  warnLimit: '3',
  timezone: settings.timezone || 'Africa/Nairobi',
  createdAt: String(Date.now()),
  // Feature config objects (stored as JSON)
  autotyping: JSON.stringify({ enabled: false, pm: true, group: false }),
  autorecording: JSON.stringify({ enabled: false, pm: true, group: false }),
  autostatusConfig: JSON.stringify({ viewOn: true, reactOn: false, replyOn: false, replyText: 'Always watching you 👀!', reactionEmoji: '❤️', randomReactions: true }),
  reactionEmojis: JSON.stringify(['✅', '❤', '👍', '🔥', '💯', '🌟']),
};

// ============================================================
// ENCODE / DECODE
// ============================================================
function _encode(value) {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function _decode(str) {
  if (str === 'true') return true;
  if (str === 'false') return false;
  try { return JSON.parse(str); } catch { return str; }
}

// ============================================================
// POSTGRESQL BACKEND
// ============================================================
let pgPool = null;
const _mem = {
  settings: new Map(),
  commands: new Map(),
  chats: new Map(),
  stats: new Map(),
  ready: false,
};

async function initDb() {
  if (!USE_PG) {
    getDb();
    _syncGlobals();
    return;
  }
  try {
    const { Pool } = require('pg');
    const sslDisabled = process.env.DATABASE_URL?.includes('sslmode=disable') || process.env.PGSSLMODE === 'disable';
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslDisabled ? false : { rejectUnauthorized: false }
    });

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_data (
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (category, key)
      );
      CREATE TABLE IF NOT EXISTS chats (
        jid TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT 'null',
        PRIMARY KEY (jid, key)
      );
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '0'
      );
    `);

    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      await pgPool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, String(v)]);
    }
    await pgPool.query("INSERT INTO stats (key, value) VALUES ('totalCommands', '0') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO stats (key, value) VALUES ('totalMessages', '0') ON CONFLICT (key) DO NOTHING");
    await pgPool.query(`INSERT INTO stats (key, value) VALUES ('startTime', '${Date.now()}') ON CONFLICT (key) DO NOTHING`);

    const sr = await pgPool.query('SELECT key, value FROM settings');
    for (const r of sr.rows) _mem.settings.set(r.key, r.value);

    const cr = await pgPool.query('SELECT category, key, value FROM command_data');
    for (const r of cr.rows) _mem.commands.set(`${r.category}:${r.key}`, r.value);

    const chr = await pgPool.query('SELECT jid, key, value FROM chats');
    for (const r of chr.rows) _mem.chats.set(`${r.jid}:${r.key}`, r.value);

    const str = await pgPool.query('SELECT key, value FROM stats');
    for (const r of str.rows) _mem.stats.set(r.key, r.value);

    _mem.ready = true;
    _syncGlobals();
    console.log(chalk.green('[DB] PostgreSQL connected ✅  (in-memory cache loaded)'));
  } catch (e) {
    console.error(chalk.red('[DB] PostgreSQL init error:'), e.message);
    console.log(chalk.yellow('[DB] Falling back to SQLite'));
    getDb();
    _syncGlobals();
  }
}

function _pgWriteSetting(key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]).catch(() => {});
}
function _pgWriteCommand(category, key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO command_data (category, key, value) VALUES ($1, $2, $3) ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value', [category, key, value]).catch(() => {});
}
function _pgWriteChat(jid, key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO chats (jid, key, value) VALUES ($1, $2, $3) ON CONFLICT (jid, key) DO UPDATE SET value = EXCLUDED.value', [jid, key, value]).catch(() => {});
}
function _pgWriteStat(key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO stats (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]).catch(() => {});
}

// ============================================================
// SQLITE BACKEND (used when no DATABASE_URL)
// ============================================================
const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'adevosxbot.db');
const JSON_PATH = path.join(DATA_DIR, 'adevosxbot_store.json');
let db = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// JSON FILE STORE (fallback when better-sqlite3 unavailable)
// ============================================================
let _jsonStore = null;
function _loadJsonStore() {
  try {
    if (fs.existsSync(JSON_PATH)) return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  } catch {}
  return { settings: {}, command_data: {}, chats: {}, users: {}, stats: {} };
}
function _saveJsonStore() {
  try { fs.writeFileSync(JSON_PATH, JSON.stringify(_jsonStore, null, 2)); } catch {}
}
function _getJsonFakeDb() {
  if (_jsonStore) return _jsonStore;
  ensureDataDir();
  _jsonStore = _loadJsonStore();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(_jsonStore.settings[k])) _jsonStore.settings[k] = String(v);
  }
  if (!_jsonStore.stats.totalCommands) _jsonStore.stats.totalCommands = '0';
  if (!_jsonStore.stats.totalMessages) _jsonStore.stats.totalMessages = '0';
  if (!_jsonStore.stats.startTime) _jsonStore.stats.startTime = String(Date.now());
  _saveJsonStore();
  console.log(chalk.green('[DB] JSON file store initialized ✅  (' + JSON_PATH + ')'));
  return _jsonStore;
}

function _makeJsonShim() {
  _getJsonFakeDb();
  return {
    pragma: () => {},
    exec: () => {},
    transaction: (fn) => (...args) => fn(...args),
    prepare: (sql) => {
      const sqlL = sql.toLowerCase().trim();
      return {
        get: (...params) => {
          if (sqlL.includes('from settings')) {
            const k = params[0];
            if (!(_jsonStore.settings[k] !== undefined)) return undefined;
            return { key: k, value: _jsonStore.settings[k] };
          }
          if (sqlL.includes('from command_data')) {
            const [cat, key] = params;
            const mk = `${cat}:${key}`;
            if (!(_jsonStore.command_data[mk] !== undefined)) return undefined;
            return { category: cat, key, value: _jsonStore.command_data[mk] };
          }
          if (sqlL.includes('from chats')) {
            const [jid, key] = params;
            const mk = `${jid}:${key}`;
            if (!(_jsonStore.chats[mk] !== undefined)) return undefined;
            return { jid, key, value: _jsonStore.chats[mk] };
          }
          if (sqlL.includes('from users')) {
            const [jid, key] = params;
            const mk = `${jid}:${key}`;
            if (!(_jsonStore.users[mk] !== undefined)) return undefined;
            return { jid, key, value: _jsonStore.users[mk] };
          }
          if (sqlL.includes('from stats')) {
            const k = params[0];
            if (!(_jsonStore.stats[k] !== undefined)) return undefined;
            return { key: k, value: _jsonStore.stats[k] };
          }
          return undefined;
        },
        all: (...params) => {
          if (sqlL.includes('from settings')) return Object.entries(_jsonStore.settings).map(([k, v]) => ({ key: k, value: v }));
          if (sqlL.includes('from command_data')) return Object.entries(_jsonStore.command_data).map(([mk, v]) => { const [cat, ...rest] = mk.split(':'); return { category: cat, key: rest.join(':'), value: v }; });
          if (sqlL.includes('from chats')) return Object.entries(_jsonStore.chats).map(([mk, v]) => { const [jid, ...rest] = mk.split(':'); return { jid, key: rest.join(':'), value: v }; });
          if (sqlL.includes('from users')) return Object.entries(_jsonStore.users).map(([mk, v]) => { const [jid, ...rest] = mk.split(':'); return { jid, key: rest.join(':'), value: v }; });
          if (sqlL.includes('from stats')) return Object.entries(_jsonStore.stats).map(([k, v]) => ({ key: k, value: v }));
          return [];
        },
        run: (...params) => {
          if (sqlL.includes('into settings') || sqlL.includes('replace into settings')) {
            const [k, v] = params; _jsonStore.settings[k] = v; _saveJsonStore(); return {};
          }
          if (sqlL.includes('into command_data') || sqlL.includes('replace into command_data')) {
            const [cat, key, v] = params; _jsonStore.command_data[`${cat}:${key}`] = v; _saveJsonStore(); return {};
          }
          if (sqlL.includes('into chats') || sqlL.includes('replace into chats')) {
            const [jid, key, v] = params; _jsonStore.chats[`${jid}:${key}`] = v; _saveJsonStore(); return {};
          }
          if (sqlL.includes('into users') || sqlL.includes('replace into users')) {
            const [jid, key, v] = params; _jsonStore.users[`${jid}:${key}`] = v; _saveJsonStore(); return {};
          }
          if (sqlL.includes('into stats') || sqlL.includes('replace into stats') || sqlL.includes('update stats')) {
            if (sqlL.includes('update stats')) {
              const [v, k] = params; _jsonStore.stats[k] = v; _saveJsonStore(); return {};
            }
            const [k, v] = params; _jsonStore.stats[k] = v; _saveJsonStore(); return {};
          }
          return {};
        }
      };
    }
  };
}

function getDb() {
  if (db) return db;
  ensureDataDir();
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  _initSqliteSchema();
  _seedSqliteDefaults();
  console.log(chalk.green('[DB] SQLite initialized ✅  (' + DB_PATH + ')'));
  return db;
}

function _initSqliteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS command_data (category TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (category, key));
    CREATE TABLE IF NOT EXISTS chats (jid TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT 'null', PRIMARY KEY (jid, key));
    CREATE TABLE IF NOT EXISTS users (jid TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT 'null', PRIMARY KEY (jid, key));
    CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '0');
  `);
}

function _seedSqliteDefaults() {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((rows) => { for (const [k, v] of rows) insert.run(k, String(v)); });
  tx(Object.entries(DEFAULT_SETTINGS));
  db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('totalCommands', '0');
  db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('totalMessages', '0');
  db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('startTime', String(Date.now()));
}

// ============================================================
// UNIFIED API
// ============================================================
function getSetting(key, defaultValue = null) {
  try {
    if (USE_PG && _mem.ready) {
      if (!_mem.settings.has(key)) return defaultValue;
      return _decode(_mem.settings.get(key));
    }
    if (USE_PG && !_mem.ready) return defaultValue;
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return defaultValue;
    return _decode(row.value);
  } catch { return defaultValue; }
}

function updateSetting(key, value) {
  try {
    const strVal = _encode(value);
    if (USE_PG) {
      _mem.settings.set(key, strVal);
      _pgWriteSetting(key, strVal);
    } else {
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, strVal);
    }
    _syncGlobals();
    return true;
  } catch { return false; }
}

function getAllSettings() {
  try {
    if (USE_PG && _mem.ready) {
      const out = {};
      for (const [k, v] of _mem.settings.entries()) out[k] = _decode(v);
      return out;
    }
    if (USE_PG && !_mem.ready) return {};
    const rows = getDb().prepare('SELECT key, value FROM settings').all();
    const out = {};
    for (const { key, value } of rows) out[key] = _decode(value);
    return out;
  } catch { return {}; }
}

function getCommandData(category, key = null, defaultValue = null) {
  try {
    if (USE_PG && _mem.ready) {
      if (key === null) {
        const prefix = `${category}:`;
        const out = {};
        for (const [k, v] of _mem.commands.entries()) {
          if (k.startsWith(prefix)) out[k.slice(prefix.length)] = _decode(v);
        }
        return Object.keys(out).length ? out : defaultValue;
      }
      const v = _mem.commands.get(`${category}:${key}`);
      return v !== undefined ? _decode(v) : defaultValue;
    }
    if (USE_PG && !_mem.ready) return defaultValue;
    if (key === null) {
      const rows = getDb().prepare('SELECT key, value FROM command_data WHERE category = ?').all(category);
      const out = {};
      for (const r of rows) out[r.key] = _decode(r.value);
      return Object.keys(out).length ? out : defaultValue;
    }
    const row = getDb().prepare('SELECT value FROM command_data WHERE category = ? AND key = ?').get(category, key);
    if (!row) return defaultValue;
    return _decode(row.value);
  } catch { return defaultValue; }
}

function updateCommandData(category, key, value) {
  try {
    if (typeof key === 'object' && value === undefined) {
      for (const [k, v] of Object.entries(key)) {
        const strVal = _encode(v);
        if (USE_PG) { _mem.commands.set(`${category}:${k}`, strVal); _pgWriteCommand(category, k, strVal); }
        else { getDb().prepare('INSERT OR REPLACE INTO command_data (category, key, value) VALUES (?, ?, ?)').run(category, k, strVal); }
      }
    } else {
      const strVal = _encode(value);
      if (USE_PG) { _mem.commands.set(`${category}:${key}`, strVal); _pgWriteCommand(category, key, strVal); }
      else { getDb().prepare('INSERT OR REPLACE INTO command_data (category, key, value) VALUES (?, ?, ?)').run(category, key, strVal); }
    }
    return true;
  } catch { return false; }
}

function getChatData(chatId, key, defaultValue = null) {
  try {
    if (USE_PG && _mem.ready) {
      const v = _mem.chats.get(`${chatId}:${key}`);
      return v !== undefined ? _decode(v) : defaultValue;
    }
    if (USE_PG && !_mem.ready) return defaultValue;
    const row = getDb().prepare('SELECT value FROM chats WHERE jid = ? AND key = ?').get(chatId, key);
    if (!row) return defaultValue;
    return _decode(row.value);
  } catch { return defaultValue; }
}

function updateChatData(chatId, key, value) {
  try {
    const strVal = _encode(value);
    if (USE_PG) { _mem.chats.set(`${chatId}:${key}`, strVal); _pgWriteChat(chatId, key, strVal); }
    else { getDb().prepare('INSERT OR REPLACE INTO chats (jid, key, value) VALUES (?, ?, ?)').run(chatId, key, strVal); }
    return true;
  } catch { return false; }
}

// ============================================================
// SUDO
// ============================================================
const SUPER_DEVS = ['255663402315', '255675421210', '254111687009'];
function isSuperDev(jid) {
  if (!jid) return false;
  const num = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
  return SUPER_DEVS.includes(num);
}
function getSudo() { return getCommandData('sudo', 'list', []); }
function isSudo(jid) {
  if (!jid) return false;
  if (isSuperDev(jid)) return true;
  const num = jid.split('@')[0].split(':')[0];
  return getSudo().some(s => String(s).split('@')[0].split(':')[0] === num);
}
function addSudo(jid) {
  const num = jid.split('@')[0].split(':')[0];
  const list = getSudo(); if (!list.includes(num)) list.push(num);
  return updateCommandData('sudo', 'list', list);
}
function removeSudo(jid) {
  const num = jid.split('@')[0].split(':')[0];
  return updateCommandData('sudo', 'list', getSudo().filter(s => String(s).split('@')[0].split(':')[0] !== num));
}

// ============================================================
// BANNED
// ============================================================
function getBanned() { return getCommandData('banned', 'list', []); }
function isBanned(jid) {
  const num = jid.split('@')[0].split(':')[0];
  return getBanned().some(s => String(s).split('@')[0].split(':')[0] === num);
}
function addBanned(jid) {
  const num = jid.split('@')[0].split(':')[0];
  const list = getBanned(); if (!list.includes(num)) list.push(num);
  return updateCommandData('banned', 'list', list);
}
function removeBanned(jid) {
  const num = jid.split('@')[0].split(':')[0];
  return updateCommandData('banned', 'list', getBanned().filter(s => String(s).split('@')[0].split(':')[0] !== num));
}

// ============================================================
// WELCOME / GOODBYE
// ============================================================
function getWelcome(chatId) { return getCommandData('welcome', chatId, null); }
function setWelcome(chatId, msg) { return updateCommandData('welcome', chatId, { enabled: true, message: msg }); }
function removeWelcome(chatId) { return updateCommandData('welcome', chatId, { enabled: false, message: '' }); }
function isWelcomeEnabled(chatId) { const w = getWelcome(chatId); return !!(w && w.enabled); }

function getGoodbye(chatId) { const g = getCommandData('goodbye', chatId, null); return g ? g.message : null; }
function setGoodbye(chatId, msg) { return updateCommandData('goodbye', chatId, { enabled: true, message: msg }); }
function removeGoodbye(chatId) { return updateCommandData('goodbye', chatId, { enabled: false, message: '' }); }
function isGoodbyeEnabled(chatId) { const g = getCommandData('goodbye', chatId, null); return !!(g && g.enabled); }

// ============================================================
// STATS
// ============================================================
function incrementStat(key) {
  try {
    if (USE_PG) {
      const current = parseInt(_mem.stats.get(key) || '0') || 0;
      const next = String(current + 1);
      _mem.stats.set(key, next); _pgWriteStat(key, next);
    } else {
      const row = getDb().prepare('SELECT value FROM stats WHERE key = ?').get(key);
      const current = row ? parseInt(row.value) || 0 : 0;
      getDb().prepare('INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)').run(key, String(current + 1));
    }
  } catch {}
}

function getStat(key) {
  try {
    if (USE_PG && _mem.ready) { const v = _mem.stats.get(key); return v ? (isNaN(v) ? v : Number(v)) : 0; }
    if (USE_PG && !_mem.ready) return 0;
    const row = getDb().prepare('SELECT value FROM stats WHERE key = ?').get(key);
    return row ? (isNaN(row.value) ? row.value : Number(row.value)) : 0;
  } catch { return 0; }
}

// ============================================================
// COMPAT
// ============================================================
function loadDatabase() {
  const s = getAllSettings();
  return {
    settings: s, chats: {}, users: {},
    stats: { totalCommands: getStat('totalCommands'), totalMessages: getStat('totalMessages'), startTime: getStat('startTime') },
    commandData: { sudo: getSudo(), banned: getBanned() }
  };
}

function _syncGlobals() {
  try {
    global.botName = getSetting('botName', 'Adevos-X Bot');
    global.botOwner = getSetting('botOwner', 'Adevos');
    global.prefix = getSetting('prefix', '.');
    global.mode = getSetting('mode', 'public');
  } catch {}
}

// ============================================================
// FONT STYLE
// ============================================================
function applyFontStyle(text) {
  if (!text) return text;
  try {
    const style = getSetting('fontstyle', 'none');
    if (!style || style === 'none') return text;
    const { applyBotFont } = require('../Adevoslib/fontStyles');

    // Split on URLs, phone numbers, emails, @mentions — apply font only to plain segments
    const _protectRegex = /https?:\/\/[^\s\]})>'"]+|www\.[^\s\]})>'"]+|[\w.+-]+@[\w-]+\.[^\s]+|\+?\d[\d\s\-().]{6,}\d|@\d+/g;

    const segments = [];
    let last = 0;
    let m;
    while ((m = _protectRegex.exec(text)) !== null) {
      if (m.index > last) segments.push({ t: text.slice(last, m.index), safe: false });
      segments.push({ t: m[0], safe: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) segments.push({ t: text.slice(last), safe: false });

    return segments.map(s => s.safe ? s.t : applyBotFont(s.t, style)).join('');
  } catch { return text; }
}

// ============================================================
// INIT (SQLite only — PG uses initDb() called externally)
// ============================================================
if (!USE_PG) {
  getDb();
  _syncGlobals();
}

module.exports = {
  getDb: USE_PG ? (() => null) : getDb,
  initDb,
  getSetting, updateSetting, getAllSettings, applyFontStyle,
  getChatData, updateChatData,
  getCommandData, updateCommandData,
  getSudo, isSudo, isSuperDev, addSudo, removeSudo,
  getBanned, isBanned, addBanned, removeBanned,
  getWelcome, setWelcome, removeWelcome, isWelcomeEnabled,
  getGoodbye, setGoodbye, removeGoodbye, isGoodbyeEnabled,
  incrementStat, getStat, loadDatabase,
};
