'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const chalk = require('chalk');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

let _authDb = null;
let _stmts = null;

function getAuthDb(dbPath) {
    if (_authDb) return _authDb;
    _authDb = new Database(dbPath);
    _authDb.pragma('journal_mode = WAL');
    _authDb.pragma('busy_timeout = 30000');
    _authDb.exec(`
        CREATE TABLE IF NOT EXISTS auth_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    const stmtSet = _authDb.prepare('INSERT OR REPLACE INTO auth_state (key, value) VALUES (?, ?)');
    const stmtDel = _authDb.prepare('DELETE FROM auth_state WHERE key = ?');
    _stmts = {
        get:     _authDb.prepare('SELECT value FROM auth_state WHERE key = ?'),
        set:     stmtSet,
        del:     stmtDel,
        setMany: _authDb.transaction((pairs) => {
            for (const { key, value } of pairs) {
                if (value !== null) stmtSet.run(key, value);
                else stmtDel.run(key);
            }
        }),
    };
    return _authDb;
}

// FIX #1: don't swallow errors silently — log what actually broke, and
// if a row is corrupted, delete it instead of leaving a poison record
// that fails forever on every read.
function readData(dbPath, key) {
    getAuthDb(dbPath);
    try {
        const row = _stmts.get.get(key);
        if (!row) return null;
        return JSON.parse(row.value, BufferJSON.reviver);
    } catch (err) {
        console.log(chalk.red(`[AuthDB] Corrupted record for key "${key}", removing it:`), err.message);
        try { _stmts.del.run(key); } catch {}
        return null;
    }
}

// FIX #2: never let a write throw up into Baileys' transaction commit.
// Log it, skip that one key, but don't kill the whole batch.
function writeData(dbPath, key, value) {
    getAuthDb(dbPath);
    try {
        const str = JSON.stringify(value, BufferJSON.replacer);
        _stmts.set.run(key, str);
    } catch (err) {
        console.log(chalk.red(`[AuthDB] Failed writing key "${key}":`), err.message);
    }
}

function removeData(dbPath, key) {
    getAuthDb(dbPath);
    try {
        _stmts.del.run(key);
    } catch (err) {
        console.log(chalk.red(`[AuthDB] Failed removing key "${key}":`), err.message);
    }
}

async function migrateFromMultiFile(dbPath) {
    if (readData(dbPath, 'creds')) return;

    const sessionDir = path.join(path.dirname(dbPath), 'session', 'auth.db');
    const fs = require('fs');
    const credsJsonPath = path.join(sessionDir, 'creds.json');

    if (!fs.existsSync(credsJsonPath)) return;

    try {
        const rawCreds = JSON.parse(
            fs.readFileSync(credsJsonPath, 'utf8'),
            BufferJSON.reviver
        );
        writeData(dbPath, 'creds', rawCreds);

        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
            if (file === 'creds.json' || !file.endsWith('.json')) continue;
            try {
                const raw = JSON.parse(
                    fs.readFileSync(path.join(sessionDir, file), 'utf8'),
                    BufferJSON.reviver
                );
                writeData(dbPath, file.slice(0, -5), raw);
            } catch {}
        }
        console.log('[sqliteAuth] Migrated existing session files into auth DB');
    } catch (e) {
        console.warn('[sqliteAuth] Migration skipped:', e.message);
    }
}

async function useSQLiteAuthState(dbPath) {
    getAuthDb(dbPath);

    await migrateFromMultiFile(dbPath);

    const creds = readData(dbPath, 'creds') || initAuthCreds();

    const keys = {
        get: async (type, ids) => {
            const data = {};
            for (const id of ids) {
                let val = readData(dbPath, `${type}-${id}`);
                if (type === 'app-state-sync-key' && val) {
                    try {
                        const { fromObject } = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData;
                        val = fromObject(val);
                    } catch (err) {
                        // FIX #3: if the stored app-state-sync-key is malformed,
                        // treat it as missing instead of throwing mid-decrypt.
                        console.log(chalk.red(`[AuthDB] Bad app-state-sync-key "${id}":`), err.message);
                        val = null;
                    }
                }
                data[id] = val;
            }
            return data;
        },
        set: async (data) => {
            // FIX #4: write key-by-key with its own try/catch instead of one
            // batch transaction that aborts everything (and throws up into
            // Baileys' own transaction wrapper) the moment one entry is bad.
            const pairs = [];
            for (const [type, typeData] of Object.entries(data)) {
                for (const [id, value] of Object.entries(typeData)) {
                    try {
                        pairs.push({
                            key: `${type}-${id}`,
                            value: value ? JSON.stringify(value, BufferJSON.replacer) : null,
                        });
                    } catch (err) {
                        console.log(chalk.red(`[AuthDB] Failed serializing ${type}-${id}:`), err.message);
                    }
                }
            }
            if (!pairs.length) return;
            try {
                _stmts.setMany(pairs);
            } catch (err) {
                // Last line of defense: don't let this bubble up and trigger
                // Baileys' "transaction failed, rolling back" on every retry.
                console.log(chalk.red('[AuthDB] setMany failed, falling back to per-key writes:'), err.message);
                for (const { key, value } of pairs) {
                    try {
                        if (value !== null) _stmts.set.run(key, value);
                        else _stmts.del.run(key);
                    } catch (e2) {
                        console.log(chalk.red(`[AuthDB] Dropping key "${key}":`), e2.message);
                    }
                }
            }
        },
    };

    const saveCreds = () => writeData(dbPath, 'creds', creds);

    return { state: { creds, keys }, saveCreds };
}

function closeAuthDb() {
    try { _authDb?.close(); _authDb = null; _stmts = null; } catch {}
}

/**
 * Clear all ephemeral Signal keys except `creds`.
 * Mirrors Atassa-MD's clean-start pattern so keys never accumulate.
 * Call once at startup BEFORE useSQLiteAuthState().
 */
function clearSignalKeys(dbPath) {
    try {
        const db = getAuthDb(dbPath);
        const result = db.prepare(`DELETE FROM auth_state WHERE key != 'creds'`).run();
        db.pragma('wal_checkpoint(TRUNCATE)');
        if (result.changes > 0) {
            console.log(`[SESSION] Cleared ${result.changes} ephemeral Signal keys (clean start)`);
        }
    } catch (e) {
        console.warn('[SESSION] clearSignalKeys skipped:', e.message);
    }
}

module.exports = { useSQLiteAuthState, closeAuthDb, clearSignalKeys, readData, writeData, removeData, getAuthDb };
