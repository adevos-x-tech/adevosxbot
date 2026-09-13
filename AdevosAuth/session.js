'use strict';

const fs   = require('fs');
const path = require('path');
const chalk = require('chalk');
const { BufferJSON } = require('@whiskeysockets/baileys');
const { readData, writeData, getAuthDb } = require('./sqliteAuthState');

// Single .db file — all session data lives here, nothing grows forever
const AUTH_DB_PATH = path.join(__dirname, '../data/adevos-x-bot-auth.db');

// Hash file lives in data/ (not inside any session dir)
const HASH_PATH = path.join(__dirname, '../data/.session_hash');

// ─── helpers ────────────────────────────────────────────────────────────────

function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(16);
}

function parseSessionString(sessionInput) {
    let s = sessionInput.trim();

    const prefixes = ['ADEVOS-X:~', 'DAVE-X:~', 'CYPHER-X:~', 'DAVE-MD:', 'DAVE-AI:', 'SESSION:', 'BAILEYS:', 'MD:'];
    for (const p of prefixes) {
        if (s.toUpperCase().startsWith(p.toUpperCase())) { s = s.slice(p.length).trim(); break; }
    }

    let parsed = null;

    if (s.startsWith('{') && s.endsWith('}')) {
        try { parsed = JSON.parse(s); } catch {}
    }
    if (!parsed) {
        try { const d = Buffer.from(s, 'base64').toString('utf8'); if (d.includes('{')) parsed = JSON.parse(d); } catch {}
    }
    if (!parsed) {
        try { const d = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); if (d.includes('{')) parsed = JSON.parse(d); } catch {}
    }
    if (!parsed) {
        try { const d = Buffer.from(s, 'hex').toString('utf8'); if (d.includes('{')) parsed = JSON.parse(d); } catch {}
    }
    if (!parsed) {
        const m = s.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    return parsed;
}

function isBaileysCreds(obj) {
    const required = ['noiseKey', 'signedIdentityKey', 'signedPreKey', 'registrationId'];
    return required.some(k => Object.prototype.hasOwnProperty.call(obj, k));
}

// Ensure the data dir exists before touching the DB
function ensureDataDir() {
    const dir = path.dirname(AUTH_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── public API ─────────────────────────────────────────────────────────────

function hasSession() {
    try {
        ensureDataDir();
        return readData(AUTH_DB_PATH, 'creds') !== null;
    } catch {
        return false;
    }
}

function loadEnvSession() {
    const envSession = process.env.SESSION_ID;
    if (!envSession || !envSession.trim()) return false;

    const newHash = hashString(envSession.trim());

    // If creds already exist and SESSION_ID hasn't changed → nothing to do
    if (hasSession()) {
        const oldHash = fs.existsSync(HASH_PATH) ? fs.readFileSync(HASH_PATH, 'utf8').trim() : '';
        if (oldHash === newHash) {
            console.log(chalk.cyan('[Adevos X Bot] Existing session found in auth DB (SESSION_ID unchanged)'));
            return true;
        }
        // SESSION_ID changed — wipe old creds so the new one loads
        console.log(chalk.yellow('[Adevos X Bot] SESSION_ID changed — clearing old session and reloading...'));
        try {
            getAuthDb(AUTH_DB_PATH).prepare('DELETE FROM auth_state').run();
        } catch {}
    }

    console.log(chalk.yellow('[Adevos X Bot] SESSION_ID found in env — loading...'));

    try {
        ensureDataDir();
        const parsed = parseSessionString(envSession.trim());

        if (!parsed) {
            console.log(chalk.red('[Adevos X Bot] Could not parse SESSION_ID in any known format'));
            return false;
        }
        if (!isBaileysCreds(parsed)) {
            console.log(chalk.red('[Adevos X Bot] SESSION_ID missing required Baileys fields'));
            return false;
        }

        // Re-parse through BufferJSON so Buffer fields are real Buffers
        const credsBuf = JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
        writeData(AUTH_DB_PATH, 'creds', credsBuf);

        try { fs.writeFileSync(HASH_PATH, newHash); } catch {}
        console.log(chalk.green('[Adevos X Bot] Session loaded from SESSION_ID env successfully'));
        return true;

    } catch (err) {
        console.log(chalk.red('[Adevos X Bot] Unexpected error loading session:'), err.message);
        return false;
    }
}

function parseAndSaveSession(sessionInput) {
    try {
        ensureDataDir();
        const parsed = parseSessionString(sessionInput);

        if (!parsed) return { success: false, error: 'Could not parse session in any known format' };
        if (!isBaileysCreds(parsed)) return { success: false, error: 'Not a valid Baileys session (missing required keys)' };

        const credsBuf = JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
        writeData(AUTH_DB_PATH, 'creds', credsBuf);
        return { success: true };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

function clearSession() {
    try {
        ensureDataDir();
        getAuthDb(AUTH_DB_PATH).prepare('DELETE FROM auth_state').run();
        try { if (fs.existsSync(HASH_PATH)) fs.unlinkSync(HASH_PATH); } catch {}
        return true;
    } catch {
        return false;
    }
}

module.exports = { AUTH_DB_PATH, loadEnvSession, parseAndSaveSession, clearSession, hasSession };
