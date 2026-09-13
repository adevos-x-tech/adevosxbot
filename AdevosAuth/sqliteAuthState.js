'use strict';

const Database = require('better-sqlite3');
const path = require('path');
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

function readData(dbPath, key) {
    getAuthDb(dbPath);
    try {
        const row = _stmts.get.get(key);
        if (!row) return null;
        return JSON.parse(row.value, BufferJSON.reviver);
    } catch {
        return null;
    }
}

function writeData(dbPath, key, value) {
    getAuthDb(dbPath);
    try {
        const str = JSON.stringify(value, BufferJSON.replacer);
        _stmts.set.run(key, str);
    } catch {}
}

function removeData(dbPath, key) {
    getAuthDb(dbPath);
    try {
        _stmts.del.run(key);
    } catch {}
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
                    const { fromObject } = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData;
                    val = fromObject(val);
                }
                data[id] = val;
            }
            return data;
        },
        set: async (data) => {
            const pairs = [];
            for (const [type, typeData] of Object.entries(data)) {
                for (const [id, value] of Object.entries(typeData)) {
                    pairs.push({
                        key: `${type}-${id}`,
                        value: value ? JSON.stringify(value, BufferJSON.replacer) : null,
                    });
                }
            }
            if (pairs.length) _stmts.setMany(pairs);
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
