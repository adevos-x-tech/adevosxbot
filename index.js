// ═══════════════════════════════════════════════════
// BAILEYS NOISE FILTER — must be first, before requires
// ═══════════════════════════════════════════════════
(function installNoiseFilter() {
  const noisyPatterns = [
    'Failed to decrypt', 'Bad MAC', 'decryptWithSessions',
    'doDecryptWhisperMessage', 'session_cipher',
    'Closing stale open', 'Decryption failed', 'SignalProtocolStore',
    'PreKeyWhisperMessage', 'closing session',
    'Closing session: SessionEntry', 'SessionEntry {',
    'recv ', 'handling frame', 'query:', 'prekey',
    'session record', 'identity key', 'sender key', 'ciphertext',
    'got notification', 'msg:ack', 'writing data', 'got ack',
    'processing message', 'updating prekeys', 'next pre key',
    'ws open', 'opened ws', 'frame buffered',
    'pairing configured', 'handshake',
    'unreadCount', 'presence',
    'Invalid mex newsletter', 'Invalid buffer', 'lid-mapping',
    'no pre key', 'No session found', 'NodeNotFoundError',
    'not found in store', 'socket error', 'stream error',
    'waiting for message', 'retry request', 'Error decoding',
    'failed to decrypt', 'bad mac', 'boom error',
    'retry count', 'reuploadRequest', 'patchMessage',
    'Connection Closed', 'Connection closed', 'connection closed',
    'ECONNRESET', 'ETIMEDOUT',
  ];

  function isNoisy(...args) {
    const str = args.map(a => {
      if (!a) return '';
      if (a instanceof Error) return a.message || '';
      return typeof a === 'string' ? a : (typeof a === 'object' ? '' : String(a));
    }).join(' ');
    return noisyPatterns.some(p => str.includes(p));
  }

  const _log = console.log.bind(console);
  const _err = console.error.bind(console);
  const _warn = console.warn.bind(console);
  console.log   = (...a) => { if (!isNoisy(...a)) _log(...a); };
  console.error = (...a) => { if (!isNoisy(...a)) _err(...a); };
  console.warn  = (...a) => { if (!isNoisy(...a)) _warn(...a); };

  // Filter raw stdout (SessionEntry dump from Baileys internals)
  const stdoutNoisePatterns = [
    'Closing session: SessionEntry', 'SessionEntry {', '_chains:',
    'chainKey:', 'registrationId:', 'currentRatchet:', 'ephemeralKeyPair:',
    'lastRemoteEphemeralKey:', 'previousCounter:', 'rootKey:', 'indexInfo:',
    'baseKey:', 'baseKeyType:', 'remoteIdentityKey:', 'pendingPreKey:',
    'signedKeyId:', 'preKeyId:', '<Buffer', 'closed: -1',
    'chainType:', 'messageKeys:',
    '"msg":"Invalid mex newsletter', '"msg":"failed to decrypt',
    'Invalid mex newsletter notification', 'failed to decrypt message',
    'MessageCounterError', 'Key used already or never filled',
    '"message":"Invalid buffer"', 'unexpected error in \'handling notification\'',
    'toRequiredBuffer', 'processNotification',
  ];
  const _stdoutWrite = process.stdout.write.bind(process.stdout);
  const _stderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = function(chunk, enc, cb) {
    const s = (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk || ''));
    if (stdoutNoisePatterns.some(p => s.includes(p))) {
      if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb();
      return true;
    }
    return _stdoutWrite(chunk, enc, cb);
  };
  process.stderr.write = function(chunk, enc, cb) {
    const s = (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk || ''));
    if (s.includes('Closing session: SessionEntry') || s.includes('SessionEntry {')) {
      if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb();
      return true;
    }
    return _stderrWrite(chunk, enc, cb);
  };
})();

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  delay,
} = require('@whiskeysockets/baileys');
const { useSQLiteAuthState } = require('./AdevosAuth/sqliteAuthState');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const chalk = require('chalk');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const NodeCache = require('node-cache');

const { loadCommands } = require('./Adevoslib/executor');
const { handleMessage, handleGroupUpdate } = require('./main.js');
const store = require('./Adevoslib/lightweight');
global.store = store; // needed by main.js reaction handler (loadMessage)
const { getSetting, updateSetting, addSudo, initDb } = require('./AdevosAuth/database');
const settings = require('./settings.js');
const { channelInfo, getBotName, createFakeContact } = require('./Adevoslib/messageConfig');
const { sendButtonV2 } = require('./Adevoslib/interactive');
const { AUTH_DB_PATH, loadEnvSession, parseAndSaveSession, clearSession } = require('./AdevosAuth/session');
const { storeMessage, handleMessageRevocation, handleMessagesDelete, handleMessageEdit } = require('./commands/owner/events');
const { handleStatusUpdate, handleAntidemote, handleAntipromote } = require('./AdevosAuth/case');
const { getCurrentTime, getCurrentTimezone } = require('./Adevoslib/myfunc');

require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');
const envPath  = path.resolve(process.cwd(), '.env');

// ═══════════════════════════════════════════════════
// DIRS
// ═══════════════════════════════════════════════════
function ensureDirs() {
  for (const d of [DATA_DIR, path.join(__dirname, 'tmp'), path.join(__dirname, 'tmp/antidelete')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════
// HOST DETECTION
// ═══════════════════════════════════════════════════
function detectHost() {
  const env = process.env;
  if (env.RENDER || env.RENDER_EXTERNAL_URL) return 'Render';
  if (env.DYNO || env.HEROKU_APP_DIR || env.HEROKU_SLUG_COMMIT) return 'Heroku';
  if (env.PORTS || env.CYPHERX_HOST_ID) return 'CypherXHost';
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return 'Vercel';
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) return 'Railway';
  if (env.REPL_ID || env.REPL_SLUG) return 'Replit';
  const hostname = os.hostname().toLowerCase();
  if (!env.CLOUD_PROVIDER && !env.DYNO && !env.VERCEL && !env.RENDER) {
    if (hostname.includes('vps') || hostname.includes('server')) return 'VPS';
    return 'Panel';
  }
  return 'Unknown Host';
}

// ═══════════════════════════════════════════════════
// ONE-TIME INIT
// ═══════════════════════════════════════════════════
let _initialized = false;
function init() {
  if (_initialized) return;
  _initialized = true;
  ensureDirs();
  loadCommands();
  store.readFromFile();
  setInterval(() => store.cleanup(), 60 * 60 * 1000);
}

// ═══════════════════════════════════════════════════
// GLOBALS FROM DATABASE
// ═══════════════════════════════════════════════════
function setGlobals() {
  global.server          = detectHost();
  global.prefix          = getSetting('prefix', settings.prefix);
  global.mode            = getSetting('mode', settings.mode);
  global.packname        = getSetting('packname', settings.packname);
  global.botName         = getSetting('botName', settings.botName);
  global.botOwner        = getSetting('botOwner', settings.botOwner);
  global.version         = getSetting('version', settings.version);
  global.author          = 'Adevos';
  global.channelLink     = 'https://whatsapp.com/channel/0029Vb6wIVU9Bb5w69FQvt0W';
  global.dev             = '255675421210';
  global.devgit          = 'https://github.com/adevos-x-tech/adevosxbot';
  global.getCurrentTime  = getCurrentTime;
  global.getCurrentTimezone = getCurrentTimezone;
  global.startTime       = Date.now();
}

// ═══════════════════════════════════════════════════
// DELETE SESSION (wipe auth DB rows — single file)
// ═══════════════════════════════════════════════════
function deleteSessionFolder() {
  try {
    const { clearSession } = require('./AdevosAuth/session');
    clearSession();
    console.log(chalk.green('[Adevos X Bot] ✅ Session data wiped from auth DB.'));
  } catch (err) {
    console.error(chalk.red('❌ Error clearing session:'), err.message);
  }
}

// ═══════════════════════════════════════════════════
// READLINE
// ═══════════════════════════════════════════════════
let rl = null;
function getRL() {
  if (!rl && process.stdin.isTTY) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => { rl = null; });
  }
  return rl;
}
const question = (text) =>
  new Promise((resolve) => {
    const iface = getRL();
    if (iface) return iface.question(text, resolve);
    // No TTY available — shouldn't normally be reached since
    // showPairingMenu exits early in non-interactive mode.
    resolve('');
  });

function closeRL() {
  if (rl) { try { rl.close(); } catch (e) {} rl = null; }
}

// ═══════════════════════════════════════════════════
// WATCH .env
// ═══════════════════════════════════════════════════
function checkEnvStatus() {
  try {
    console.log(chalk.green('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮'));
    console.log(chalk.green('│      .env file watcher active.      │'));
    console.log(chalk.green('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'));
    if (fs.existsSync(envPath)) {
      fs.watch(envPath, { persistent: false }, (ev) => {
        if (ev === 'change') {
          console.log(chalk.bgRed.black('================================================='));
          console.log(chalk.white.bgGreen('[Adevos X Bot] 🚨 .env file change detected!'));
          console.log(chalk.white.bgGreen('Restart bot to apply new configuration (e.g., SESSION_ID).'));
          console.log(chalk.red.bgBlack('================================================='));
        }
      });
    }
  } catch (err) {
    console.log(chalk.red(`❌ Failed to setup .env watcher: ${err.message}`));
  }
}

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let sock = null;
let reconnectAttempts = 0;
let isPairing = false;
let _startupMsgSent = false;
const MAX_RECONNECT = 5;

// ═══════════════════════════════════════════════════
// PAIRING MENU
// ═══════════════════════════════════════════════════
async function showPairingMenu() {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮'));
    console.log(chalk.red('│   ❌ NO SESSION FOUND (non-interactive)   │'));
    console.log(chalk.red('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'));
    console.log(chalk.yellow('[Adevos X Bot] Add SESSION_ID to your .env file, or'));
    console.log(chalk.yellow('[Adevos X Bot] run the bot once in an interactive terminal to pair.'));
    process.exit(1);
  }

  console.log(chalk.green('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮'));
  console.log(chalk.green('│') + chalk.white.bold('        CONNECTION OPTIONS       ') + chalk.green('  │'));
  console.log(chalk.green('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'));
  console.log('');
  console.log(chalk.bold.blue('❯❯ 1. Enter phone number for new pairing'));
  console.log(chalk.bold.blue('❯❯ 2. Use SESSION_ID from Secrets / .env'));
  console.log(chalk.bold.blue('❯❯ 3. Paste fresh new session'));
  console.log('');

  const option = (await question(chalk.bgBlack(chalk.green('Choose between option: 1--2--3\n')))).trim();

  if (option === '2') {
    console.log(chalk.cyan('\n[Adevos X Bot] 🔍 Checking .env for SESSION_ID...'));
    const loaded = loadEnvSession();
    if (loaded) {
      console.log(chalk.green('[Adevos X Bot] ✅ Session loaded from .env successfully!'));
      console.log(chalk.cyan('[Adevos X Bot] 🔄 Connecting with .env session...'));
      closeRL();
      return null;
    }
    console.log(chalk.red('❌ No valid SESSION_ID found in .env'));
    console.log(chalk.yellow('💡 Tip: Add SESSION_ID to your .env file'));
    console.log(chalk.yellow('   Format: SESSION_ID=ADEVOS-X:~ your_base64_session_here'));
    console.log('');
    console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
    console.log('');

  } else if (option === '3') {
    console.log(chalk.green('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮'));
    console.log(chalk.green('│') + chalk.green('       📋 PASTE YOUR SESSION    ') + chalk.green('  │'));
    console.log(chalk.green('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'));
    console.log('');
    console.log(chalk.yellow('✅ Supported formats:'));
    console.log(chalk.white('   • Base64 with prefix: ADEVOS-X:~ eyJub2..'));
    console.log(chalk.white('   • Base64 without prefix: eyJub2lzy....'));
    console.log(chalk.white('   • Raw JSON: {"noiseKey":{"private":...'));
    console.log('');
    console.log(chalk.cyan('Paste your session below (Get it from here: pair.adevosxtech.site)'));
    console.log('');

    const pasted = (await question(chalk.bgBlack(chalk.green('> ')))).trim();

    if (!pasted || pasted.trim().length < 50) {
      console.log(chalk.red('❌ Session too short or empty!'));
      console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
      console.log('');
    } else {
      console.log(chalk.cyan('[Adevos X Bot] 🔍 Analyzing session format...'));
      const result = parseAndSaveSession(pasted);
      if (result.success) {
        console.log(chalk.green('[Adevos X Bot] ✅ Session saved successfully!'));
        console.log(chalk.cyan('[Adevos X Bot] 🔄 Connecting with pasted session...'));
        closeRL();
        return null;
      }
      console.log(chalk.red('[Adevos X Bot] ❌ Failed to parse session!'));
      console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
      console.log('');
    }
  }

  const raw = (await question(chalk.bgBlack(chalk.green(
    'Please type your WhatsApp number\nFormat: 255xxx (without + or spaces) : '
  )))).trim();

  return raw.replace(/[^0-9]/g, '');
}

// ═══════════════════════════════════════════════════
// CONNECT / RECONNECT
// ═══════════════════════════════════════════════════
async function connect() {
  if (sock) {
    try { sock.ev.removeAllListeners(); sock.end(null); } catch (e) {}
    sock = null;
  }

  // Refresh globals from DB on each connect
  setGlobals();
  loadEnvSession();

  // ── Fetch latest Baileys version, with fallback if network fails ──
  let version, isLatest;
  try {
    ({ version, isLatest } = await fetchLatestBaileysVersion());
    console.log(chalk.cyan(`[Adevos X Bot] 📦 Baileys ${version.join('.')} | latest: ${isLatest}`));
  } catch (err) {
    console.log(chalk.yellow(`[Adevos X Bot] ⚠️ Could not fetch latest Baileys version (${err.message}). Using built-in default.`));
    version = undefined; // makeWASocket falls back to its built-in default version
    isLatest = false;
  }

  // Preserve all Signal and app-state keys in the SQLite auth database.
  // Deleting them on startup causes avoidable Bad MAC/app-state failures.

  const { state, saveCreds } = await useSQLiteAuthState(AUTH_DB_PATH);
  const msgRetryCounterCache = new NodeCache();

  const alreadyRegistered = !!state.creds.registered;

  let phoneNumber = '';
  if (!alreadyRegistered) {
    const num = await showPairingMenu();

    if (num === null) {
      return connect();
    }

    phoneNumber = num;
    if (!phoneNumber || phoneNumber.length < 7) {
      console.log(chalk.red('[Adevos X Bot] Invalid phone number. Exiting.'));
      process.exit(1);
    }
    isPairing = true;

    // Auto-save pairing number as owner if not already set
    const { updateSetting, getSetting: getS2 } = require('./AdevosAuth/database');
    const curOwner = String(getS2('ownerNumber', '') || '').replace(/\D/g, '');
    if (!curOwner) {
      updateSetting('ownerNumber', phoneNumber);
      global.ownerNumber = phoneNumber;
      console.log(chalk.green(`[Adevos X Bot] ✅ Owner number set to: +${phoneNumber}`));
    } else {
      console.log(chalk.cyan(`[Adevos X Bot] ℹ️  Owner number already set: +${curOwner}`));
    }
  }

  sock = makeWASocket({
    ...(version ? { version } : {}),
    logger: pino({ level: 'error' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'fatal' }).child({ level: 'fatal' })
      ),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    keepAliveIntervalMs: 10_000,
    connectTimeoutMs: 60_000,
    getMessage: async (key) => {
      const jid = jidNormalizedUser(key.remoteJid);
      const msg = await store.loadMessage(jid, key.id);
      return msg?.message || '';
    },
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined,
  });

  store.bind(sock.ev);
  global.sock = sock;

  // Track whether this socket has already closed, so late-firing
  // callbacks (e.g. pairing code) can bail out cleanly.
  let _connectionClosed = false;

  if (sock.ws && typeof sock.ws.on === 'function') {
    sock.ws.on('error', (err) => {
      console.error(chalk.red('[Adevos X Bot] ❌ WebSocket error:'), err?.message || err);
    });
  }

  // ── Pairing code ──
  if (!alreadyRegistered && phoneNumber) {
    setTimeout(async () => {
      if (_connectionClosed) {
        console.log(chalk.yellow('[Adevos X Bot] Skipping pairing code request — connection already closed.'));
        return;
      }
      try {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log('');
        console.log(chalk.green('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮'));
        console.log(chalk.green('│') + chalk.white.bold('         PAIRING CODE         ') + chalk.green('│'));
        console.log(chalk.green('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'));
        console.log('');
        console.log(chalk.cyan.bold(`    ${code}    `));
        console.log('');
        console.log(chalk.yellow('📱 How to link your WhatsApp:'));
        console.log(chalk.white('❯❯ Open WhatsApp on your phone'));
        console.log(chalk.white('❯❯ Go to Settings > Linked Devices'));
        console.log(chalk.white('❯❯ Tap "Link a  Device"'));
        console.log(chalk.white('❯❯ Choose "Link with phone number"'));
        console.log(chalk.white('❯❯ Enter the code: ') + chalk.green.bold(code));
        console.log('');
        console.log(chalk.cyan.bold('⏱️  Code expires in 1 minute'));
        console.log('');
      } catch (err) {
        console.log(chalk.red('[Adevos X Bot] Pairing code error:'), err.message);
      }
    }, 3000);
  }

  // ── Connection events ──
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      isPairing = false;
      reconnectAttempts = 0;
      closeRL();

      // Refresh globals after connect
      setGlobals();
      global.sock = sock;

      // Mark bot as online (fixes "last active at" presence)
      sock.sendPresenceUpdate('available').catch(() => {});

      const botName = getBotName();
      const userId  = sock.user?.id || '';

      // Capture LID (try multiple sources)
      const rawLid = sock.user?.lid
        || sock.authState?.creds?.me?.lid
        || sock.authState?.creds?.account?.lid
        || '';
      if (rawLid) {
        global.ownerLid = String(rawLid).split(':')[0].split('.')[0];
      }

      // Auto-save owner phone number from the live session
      const ownerPhoneNum = userId.split(':')[0].replace(/[^0-9]/g, '');
      if (ownerPhoneNum) {
        const existingOwner = getSetting('ownerNumber', '');
        if (!existingOwner) {
          await updateSetting('ownerNumber', ownerPhoneNum);
        }
        // Always ensure owner phone is in sudo list
        addSudo(ownerPhoneNum + '@s.whatsapp.net');
        global.ownerPhone = ownerPhoneNum;
      }
      // Also add owner LID to sudo so group messages from owner pass isSudo()
      if (global.ownerLid && global.ownerLid !== ownerPhoneNum) {
        addSudo(global.ownerLid + '@s.whatsapp.net');
      }

      const ownerNum = '+' + userId.split(':')[0].replace(/[^0-9]/g, '');
      const cmdCount = global.commands?.size || 0;
      const W2 = 30;
      const _cb = chalk.hex('#00b4d8');
      const _cr = chalk.hex('#e63946');
      const _cw = chalk.white.bold;
      const _cv = chalk.hex('#caf0f8');
      const _cg = chalk.hex('#90e0ef');
      const row2 = (icon, lbl, val, red = false) => {
        const raw = ` ${icon} ${lbl}: ${val}`;
        const pad = ' '.repeat(Math.max(0, W2 - raw.length));
        const lbFn = red ? chalk.hex('#ff6b6b').bold : _cg;
        return _cb('│') + ` ${icon} ` + lbFn(`${lbl}: `) + _cv(`${val}`) + pad + _cb('│');
      };
      console.log('');
      console.log(_cb('╭') + _cr('━'.repeat(W2)) + _cb('╮'));
      const title = ' ✅ CONNECTED ';
      console.log(_cb('│') + _cw(title + ' '.repeat(Math.max(0, W2 - title.length))) + _cb('│'));
      console.log(_cb('├') + _cr('━'.repeat(W2)) + _cb('┤'));
      console.log(row2('🤖', 'Bot  ', botName));
      console.log(row2('👑', 'Owner', ownerNum, true));
      console.log(row2('📦', 'Cmds ', String(cmdCount)));
      console.log(row2('🔑', 'Pfx  ', global.prefix || '.'));
      console.log(row2('🌍', 'Mode ', global.mode || 'public'));
      console.log(_cb('╰') + _cr('━'.repeat(W2)) + _cb('╯'));
      console.log('');

      // ── WhatsApp welcome message → bot's own number (only ONCE per process) ──
      if (!_startupMsgSent) {
        _startupMsgSent = true;
        const botNumber = userId.split(':')[0] + '@s.whatsapp.net';
        const fake = createFakeContact(botNumber);
        const time = getCurrentTime('time2');

        try {
          await sendButtonV2(sock, botNumber, {
            body: `
╭━| *Adevos-X Bot Connected* |━
┃❯❯ *Prefix:* ${global.prefix}
┃❯❯ *Commands:* ${global.commands?.size || 0}
┃❯❯ *Mode:* ${global.mode || 'public'}
┃❯❯ *Time:* ${time}
┃❯❯ *Host:* host.adevosxtech.site 
┃❯❯ *Dev:* @adevosX
╰──────━━━━━━━━──────`,
            footer: '𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐀𝐝𝐞𝐯𝐨𝐬-𝐗 𝐓𝐞𝐜𝐡 ⓒ',
            buttons: [
              { text: 'Menu', id: `${global.prefix || '.'}menu` },
              { text: 'Ping', id: `${global.prefix || '.'}ping` },
              { text: 'Status', id: `${global.prefix || '.'}status` },
            ],
            quoted: fake,
            userJid: sock.user?.id || '',
          });
          console.log(chalk.green('[Adevos X Bot] ✅ Startup message sent.'));
        } catch (error) {
          console.error(chalk.red('[Adevos X Bot] Could not send startup message:'), error.message);
        }
      } else {
        console.log(chalk.cyan('[Adevos X Bot] 🔄 Reconnected (startup message already sent).'));
      }

      await delay(1000);

      // ── Follow newsletters (compulsory, hardcoded) ──────────────────────
      const _nlFollow = [
           '120363408344756821@newsletter',
           '120363400480173280@newsletter',
           '120363425037487526@newsletter'
      ];
      for (const _nl of _nlFollow) {
        try { await sock.newsletterFollow(_nl); } catch (_) {}
        await delay(500);
      }

      // ── Auto-join  group ────────────────────────────────────────────
      try { await sock.groupAcceptInvite('Laiof10oxug67HJraFxBIj'); } catch (_) {}

      // ── Pre-populate LID→phone cache from all group participants ─────────
      setImmediate(async () => {
        try {
          await delay(8000);
          const { cacheLidPhone } = require('./AdevosAuth/lidResolver');
          const groups = await sock.groupFetchAllParticipating();
          let mapped = 0;
          for (const meta of Object.values(groups)) {
            for (const p of (meta.participants || [])) {
              const pid  = (p.id  || '').trim();
              const plid = (p.lid || '').trim();
              const isPhone = (j) => j && j.endsWith('@s.whatsapp.net');
              const isLid   = (j) => j && j.endsWith('@lid');

              // Layer A: classic format — id=phone@s.whatsapp.net, lid=xxx@lid
              if (isPhone(pid) && isLid(plid)) {
                const phone = pid.split('@')[0].split(':')[0];
                const lid   = plid.split('@')[0].split(':')[0];
                if (/^\d{7,15}$/.test(phone)) { cacheLidPhone(lid, phone); mapped++; }
              } else if (isLid(pid) && isPhone(plid)) {
                const lid   = pid.split('@')[0].split(':')[0];
                const phone = plid.split('@')[0].split(':')[0];
                if (/^\d{7,15}$/.test(phone)) { cacheLidPhone(lid, phone); mapped++; }
              }

              // Layer B: new LID-only format — id=xxx@lid, phoneNumber field exposed
              const pPhone = p.phoneNumber ? String(p.phoneNumber).replace(/[^0-9]/g, '') : null;
              if (pPhone && /^\d{7,15}$/.test(pPhone)) {
                if (isLid(pid)) {
                  const lid = pid.split('@')[0].split(':')[0];
                  cacheLidPhone(lid, pPhone); mapped++;
                } else if (isLid(plid)) {
                  const lid = plid.split('@')[0].split(':')[0];
                  cacheLidPhone(lid, pPhone); mapped++;
                }
              }
            }
          }
          console.log(`[LID] Pre-cached ${mapped} LID→phone from ${Object.keys(groups).length} groups`);
        } catch (e) {
          console.log('[LID] Group pre-cache error:', e.message);
        }
      });
    }

    if (connection === 'close') {
      _connectionClosed = true;

      const error      = lastDisconnect?.error;
      const statusCode = (error instanceof Boom) ? error.output?.statusCode : (error?.output?.statusCode || 0);

      console.log(chalk.yellow(`[Adevos X Bot] ⚠️ Connection closed. Status code: ${statusCode}`));

      // Logged out / 401
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log(chalk.red('[Adevos X Bot] 🚨 Logged out — deleting session'));
        clearSession();
        await delay(3000);
        process.exit(0);
      }

      // Bad session
      if (statusCode === DisconnectReason.badSession) {
        console.log(chalk.red('[Adevos X Bot] 🚨 Bad session — deleting and reconnecting'));
        deleteSessionFolder();
        reconnectAttempts = 0;
        await delay(3000);
        return connect();
      }

      // 440 — stream conflict (session opened/active elsewhere)
      if (statusCode === 440) {
        console.log(chalk.red('[Adevos X Bot] ⚠️ Stream conflict (440) — this session is active elsewhere.'));
        console.log(chalk.yellow('[Adevos X Bot] Waiting 20s before retrying to avoid a reconnect fight...'));
        await delay(20000);
        return connect();
      }

      // 408 pairing timeout
      if (statusCode === 408 && isPairing) {
        console.log(chalk.yellow('[Adevos X Bot] ⏱️ Pairing timeout (408) — reconnecting for new code...'));
        isPairing = false;
        await delay(3000);
        return connect();
      }

      // Restart-required codes
      if ([515, 516].includes(statusCode)) {
        console.log(chalk.yellow(`[Adevos X Bot] 🔄 Restart required (${statusCode}) — reconnecting...`));
        reconnectAttempts = 0;
        await delay(3000);
        return connect();
      }

      // Normal reconnect codes — back off if this keeps happening repeatedly,
      // instead of resetting to 0 and hammering reconnect every 5s forever.
      // Rapid 428/408 loops were re-triggering a fresh burst of buffered
      // message decryption (and the auth-state transaction errors) on every retry.
      if ([408, 428, DisconnectReason.timedOut, DisconnectReason.connectionLost].includes(statusCode)) {
        reconnectAttempts++;
        const wait = Math.min(5000 * reconnectAttempts, 30_000);
        console.log(chalk.cyan(`[Adevos X Bot] 🔄 Connection lost (${statusCode}) — reconnecting in ${wait / 1000}s (attempt ${reconnectAttempts})...`));
        await delay(wait);
        if (reconnectAttempts >= 6) {
          console.log(chalk.yellow('[Adevos X Bot] Repeated connection drops — pausing 30s before next attempt.'));
          reconnectAttempts = 0;
          await delay(30000);
        }
        return connect();
      }

      // 500 — corrupted session
      if (statusCode === 500) {
        if (reconnectAttempts >= 3) {
          console.log(chalk.red('[Adevos X Bot] 🗑️ Too many 500 errors — deleting session'));
          deleteSessionFolder();
          reconnectAttempts = 0;
          await delay(5000);
          return connect();
        }
        reconnectAttempts++;
        console.log(chalk.yellow(`[Adevos X Bot] 🔄 Retry ${reconnectAttempts}/3 in 30s...`));
        await delay(30000);
        return connect();
      }

      // All others — retry indefinitely; never exit silently
      reconnectAttempts++;
      const wait = Math.min(10000 * reconnectAttempts, 60_000);
      console.log(chalk.cyan(`[Adevos X Bot] 🔄 Reconnecting... (attempt ${reconnectAttempts}) in ${wait / 1000}s`));
      await delay(wait);
      return connect();
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Contacts events → populate LID↔phone cache in real time ─────────────
  const _cacheFromContacts = (contacts) => {
    try {
      const { cacheLidPhone } = require('./AdevosAuth/lidResolver');
      for (const c of (contacts || [])) {
        const cid  = (c.id  || '').trim();
        const clid = (c.lid || '').trim();
        if (cid.endsWith('@s.whatsapp.net') && clid.endsWith('@lid')) {
          const phone = cid.split('@')[0].split(':')[0];
          const lid   = clid.split('@')[0].split(':')[0];
          if (/^\d{7,15}$/.test(phone)) cacheLidPhone(lid, phone);
        } else if (cid.endsWith('@lid') && clid.endsWith('@s.whatsapp.net')) {
          const lid   = cid.split('@')[0].split(':')[0];
          const phone = clid.split('@')[0].split(':')[0];
          if (/^\d{7,15}$/.test(phone)) cacheLidPhone(lid, phone);
        }
      }
    } catch {}
  };
  sock.ev.on('contacts.upsert', _cacheFromContacts);
  sock.ev.on('contacts.update', (updates) => _cacheFromContacts(updates.map(u => ({ id: u.id, lid: u.lid }))));
  // ──────────────────────────────────────────────────────────────────────────

  // ── Incoming messages (ev.on — this is what Baileys actually fires for messages) ──
  sock.ev.on('messages.upsert', (m) => {
    const { messages, type } = m;

    // Store messages + handle status broadcasts
    for (const msg of messages) {
      if (!msg.key?.remoteJid) continue;
      if (msg.key.remoteJid === 'status@broadcast') {
        if (type === 'notify') {
          handleStatusUpdate(sock, { messages: [msg], type }).catch(() => {});
        }
        continue;
      }
      try { storeMessage(msg.key.remoteJid, msg); } catch (_) {}

      // Antidelete — protocol-level delete-for-everyone
      const proto = msg.message?.protocolMessage;
      if ((proto?.type === 0 || proto?.type === 7) && proto?.key) {
        handleMessageRevocation(sock, msg).catch(() => {});
      }

      // Antiedit — protocol-level message edit (type 14 / editedMessage)
      if (proto && (proto.type === 14 || proto.editedMessage)) {
        handleMessageEdit(sock, msg).catch(() => {});
      }

    }

    // Route to command handler — only for genuinely new messages.
    // 'append'-type upsert events are historical/resynced messages
    // (e.g. replayed after a reconnect) and must NOT be re-processed as
    // fresh commands, or the same command runs repeatedly.
    if (type === 'notify') {
      handleMessage(sock, m).catch(e =>
        console.error(chalk.red('[Adevos X Bot] MSG ERROR:'), e.message)
      );
    }
  });

  // ── NEWSLETTER AUTO-REACT (compulsory, hardcoded) ───────────────────────
  const _NEWSLETTER_JIDS = [
    '120363408344756821@newsletter',
    '120363400480173280@newsletter',
    '120363425037487526@newsletter'
  ];
  const _NEWSLETTER_EMOJIS = ['❤️', '💛', '👍', '💜', '😮', '🤍', '💙'];
  sock.ev.on('messages.upsert', async (mek) => {
    try {
      const msg = mek.messages[0];
      if (!msg?.message) return;
      if (_NEWSLETTER_JIDS.includes(msg?.key?.remoteJid) && msg?.key?.server_id) {
        await sock.newsletterReactMessage(
          msg.key.remoteJid,
          msg.key.server_id.toString(),
          _NEWSLETTER_EMOJIS[Math.floor(Math.random() * _NEWSLETTER_EMOJIS.length)]
        );
      }
    } catch (_) {}
  });

  // ev.process for remaining bufferable events
  sock.ev.process(async (events) => {
    const evKeys = Object.keys(events).filter(k => k !== 'messages.upsert');

    // ── Group participant changes (antidemote, welcome/bye) ──
    if (events['group-participants.update']) {
      const update = events['group-participants.update'];
      handleGroupUpdate(sock, update).catch(e =>
        console.error(chalk.red('[Adevos X Bot] GROUP ERROR:'), e.message)
      );
      handleAntidemote(sock, update).catch(() => {});
      handleAntipromote(sock, update).catch(() => {});
    }

    // ── Store-level message delete (backup antidelete path) ──
    if (events['messages.delete']) {
      handleMessagesDelete(sock, events['messages.delete']).catch(() => {});
    }
  });

  // Anti-call — decline/block incoming calls, and anti-group-call
  sock.ev.on('call', async (calls) => {
    try {
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        const botNum = (sock.user.id || '').split(':')[0];
        const callerId = call.from;
        if ((callerId || '').includes(botNum)) continue;

        // ── Group calls: separate feature (antigroupcall.js), per-group warn/kick ──
        if (call.isGroup && call.chatId) {
          try {
            const { getChatData, updateChatData } = require('./AdevosAuth/database');
            const { addWarning } = require('./Adevoslib/warnings');
            const gcCfg = getChatData(call.chatId, 'antigroupcall', { enabled: false, action: 'warn', maxWarnings: 3 });
            if (gcCfg.enabled) {
              try { await sock.rejectCall(call.id, call.from); } catch {}
              const tag = `@${(callerId || '').split('@')[0]}`;
              const { buildFrame } = require('./Adevoslib/frame');
              const { getBotName } = require('./Adevoslib/messageConfig');
              if (gcCfg.action === 'kick') {
                await sock.groupParticipantsUpdate(call.chatId, [callerId], 'remove').catch(() => {});
                await sock.sendMessage(call.chatId, { text: buildFrame({ title: 'Antigroupcall', fields: [['Kicked', tag], ['Reason', 'Group calls are not allowed']] }), mentions: [callerId] }).catch(() => {});
              } else {
                const { count, limit, kicked } = addWarning(call.chatId, callerId, 'Group call not allowed');
                await sock.sendMessage(call.chatId, { text: buildFrame({ title: 'Antigroupcall', fields: [['Warned', tag], ['Warnings', `${count}/${limit}`]] }), mentions: [callerId] }).catch(() => {});
                if (kicked) await sock.groupParticipantsUpdate(call.chatId, [callerId], 'remove').catch(() => {});
              }
            }
          } catch (e) { console.error('[ANTIGROUPCALL] error:', e.message); }
          continue;
        }

        const cfg = getSetting('anticall', { enabled: false, mode: 'decline', message: 'Calls are not allowed!', allowed: [] });
        if (!cfg.enabled) continue;
        const callerNum = (callerId || '').split('@')[0];
        if ((cfg.allowed || []).includes(callerNum)) continue;

        try { await sock.rejectCall(call.id, call.from); } catch {}

        const botName = getBotName();
        const ownerJid = botNum + '@s.whatsapp.net';
        const fake = createFakeContact(callerId || ownerJid);

        if (cfg.mode === 'block' || cfg.mode === 'both') {
          try { await sock.updateBlockStatus(callerId, 'block'); } catch {}
          sock.sendMessage(ownerJid, {
            text: buildFrame({ title: 'Call Blocked', fields: [['From', `@${callerNum}`], ['Mode', (cfg.mode || 'block').toUpperCase()]] }),
            mentions: [callerId]
          }, { quoted: fake }).catch(() => {});
        }

        const customMsg = cfg.message || 'Calls are not allowed!';
        sock.sendMessage(callerId, {
          text: buildHint(customMsg)
        }, { quoted: fake }).catch(() => {});
      }
    } catch (e) {}
  });
}

// ═══════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════

// Init dirs and commands
init();
setGlobals();

// ───  style startup frame ──────────────────────────────────────────────
(function printStartupFrame() {
  const border   = chalk.hex('#00ff00');
  const titleClr = chalk.hex('#ff00ff').bold;
  const info     = chalk.hex('#00ffff');
  const W = 36;
  const center = (s) => {
    const len = s.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').length;
    const pad = Math.max(0, Math.floor((W - len) / 2));
    return ' '.repeat(pad) + s + ' '.repeat(Math.max(0, W - len - pad));
  };
  console.log('');
  console.log(border('╭' + '─'.repeat(W) + '╮'));
  console.log(border('│') + titleClr(center('     𝐀𝐝𝐞𝐯𝐨𝐬-𝐗 𝐁𝐨𝐭  𝐕𝐞𝐫𝐬𝐢𝐨𝐧 3')) + border('        │'));
  console.log(border('├' + '─'.repeat(W) + '┤'));
  console.log(border('│') + info(center('𝐁𝐮𝐢𝐥𝐭 𝐢𝐧 𝐜𝐚𝐥𝐦 𝐰𝐚𝐲. 𝐍𝐨 𝐫𝐨𝐨𝐦 𝐟𝐨𝐫 𝐞𝐫𝐫𝐨𝐬')) + border('│'));
  console.log(border('├' + '─'.repeat(W) + '┤'));
  console.log(border('│') + info(center('   𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐀𝐝𝐞𝐯𝐨𝐬-𝐗 𝐓𝐞𝐜𝐡 ⓒ')) + border('       │'));
  console.log(border('╰' + '─'.repeat(W) + '╯'));
  console.log('');
})();

checkEnvStatus();

console.log(chalk.cyan(`[Adevos X Bot] 🖥️  Platform : ${global.server}`));
console.log(chalk.cyan(`[Adevos X Bot] 📦 Node     : ${process.version}`));
console.log('');


// ── Suppress noisy internal library logs ──
const _origLog = console.log.bind(console);
console.log = (...args) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (first.startsWith('Interactive send:')) return;
  _origLog(...args);
};

// ── Error handlers ──
process.on('uncaughtException', (err) => {
  console.log(chalk.red('[Adevos X Bot] ❌ Uncaught exception:'), err.message);
  console.log(chalk.yellow('[Adevos X Bot] 🔄 Attempting to reconnect...'));
  setTimeout(() => connect().catch(() => {}), 5000);
});

process.on('unhandledRejection', (reason) => {
  console.log(chalk.red('[Adevos X Bot] ❌ Unhandled Rejection:'), reason);
});

// ── Graceful shutdown — flush WAL and close DBs cleanly ──
function gracefulShutdown(signal) {
  console.log(chalk.yellow(`\n[Adevos X Bot] ${signal} received — shutting down cleanly...`));
  try { store.close(); } catch {}
  try { require('./AdevosAuth/sqliteAuthState').closeAuthDb(); } catch {}
  try { if (sock) { sock.ev.removeAllListeners(); sock.end(null); } } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── Start ──
initDb()
  .then(() => {
    setGlobals();
    connect().catch(err => {
      console.error(chalk.red('[Adevos X Bot] FATAL:'), err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error(chalk.red('[Adevos X Bot] DB init error:'), err.message);
    connect().catch(err2 => {
      console.error(chalk.red('[Adevos X Bot] FATAL:'), err2);
      process.exit(1);
    });
  });