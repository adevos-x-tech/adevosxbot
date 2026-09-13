'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH               = path.join(__dirname, '../data/davex-store.db');
const MAX_MESSAGES_PER_CHAT = 50;
const MAX_CONTACTS          = 1_000;
const MAX_CHATS             = 500;
const MAX_GROUP_META        = 300;
const MSG_TTL_DAYS          = 7;

class LightweightStore {
    constructor() {
        this._db    = null;
        this._stmts = null;
    }

    _getDb() {
        if (this._db) return this._db;

        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        this._db = new Database(DB_PATH);
        this._db.pragma('journal_mode = WAL');
        this._db.pragma('synchronous = NORMAL');
        this._db.pragma('busy_timeout = 5000');

        this._db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                jid    TEXT NOT NULL,
                msg_id TEXT NOT NULL,
                data   TEXT NOT NULL,
                ts     INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (jid, msg_id)
            );
            CREATE INDEX IF NOT EXISTS idx_messages_jid_ts ON messages (jid, ts);

            CREATE TABLE IF NOT EXISTS contacts (
                jid  TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                ts   INTEGER NOT NULL DEFAULT (unixepoch())
            );

            CREATE TABLE IF NOT EXISTS chats (
                jid  TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                ts   INTEGER NOT NULL DEFAULT (unixepoch())
            );

            CREATE TABLE IF NOT EXISTS group_metadata (
                jid  TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                ts   INTEGER NOT NULL DEFAULT (unixepoch())
            );
        `);

        this._stmts = {
            // ── messages ─────────────────────────────────────────────────────
            insertMsg: this._db.prepare(
                'INSERT OR REPLACE INTO messages (jid, msg_id, data, ts) VALUES (?, ?, ?, unixepoch())'
            ),
            pruneMsg: this._db.prepare(`
                DELETE FROM messages
                WHERE jid = ?
                  AND msg_id NOT IN (
                      SELECT msg_id FROM messages WHERE jid = ? ORDER BY ts DESC LIMIT ?
                  )
            `),
            expireMsg: this._db.prepare(
                'DELETE FROM messages WHERE ts < unixepoch() - ?'
            ),
            getMsg:  this._db.prepare('SELECT data FROM messages WHERE jid = ? AND msg_id = ?'),
            getMsgs: this._db.prepare(
                'SELECT data FROM messages WHERE jid = ? ORDER BY ts DESC LIMIT ?'
            ),

            // ── contacts ─────────────────────────────────────────────────────
            getContact: this._db.prepare('SELECT data FROM contacts WHERE jid = ?'),
            upsertContact: this._db.prepare(
                'INSERT OR REPLACE INTO contacts (jid, data, ts) VALUES (?, ?, unixepoch())'
            ),
            countContacts: this._db.prepare('SELECT COUNT(*) AS n FROM contacts'),
            pruneContacts: this._db.prepare(
                'DELETE FROM contacts WHERE jid NOT IN (SELECT jid FROM contacts ORDER BY ts DESC LIMIT ?)'
            ),

            // ── chats ─────────────────────────────────────────────────────────
            getChat: this._db.prepare('SELECT data FROM chats WHERE jid = ?'),
            upsertChat: this._db.prepare(
                'INSERT OR REPLACE INTO chats (jid, data, ts) VALUES (?, ?, unixepoch())'
            ),
            countChats: this._db.prepare('SELECT COUNT(*) AS n FROM chats'),
            pruneChats: this._db.prepare(
                'DELETE FROM chats WHERE jid NOT IN (SELECT jid FROM chats ORDER BY ts DESC LIMIT ?)'
            ),

            // ── group metadata ────────────────────────────────────────────────
            getGroupMeta: this._db.prepare('SELECT data FROM group_metadata WHERE jid = ?'),
            upsertGroupMeta: this._db.prepare(
                'INSERT OR REPLACE INTO group_metadata (jid, data, ts) VALUES (?, ?, unixepoch())'
            ),
            countGroupMeta: this._db.prepare('SELECT COUNT(*) AS n FROM group_metadata'),
            pruneGroupMeta: this._db.prepare(
                'DELETE FROM group_metadata WHERE jid NOT IN (SELECT jid FROM group_metadata ORDER BY ts DESC LIMIT ?)'
            ),
        };

        // ── Batch transactions ────────────────────────────────────────────────
        this._txMessages = this._db.transaction((msgs) => {
            for (const msg of msgs) {
                if (!msg.key?.remoteJid || !msg.key?.id) continue;
                const jid = msg.key.remoteJid;
                this._stmts.insertMsg.run(jid, msg.key.id, JSON.stringify(msg));
                this._stmts.pruneMsg.run(jid, jid, MAX_MESSAGES_PER_CHAT);
            }
        });

        this._txContactsUpsert = this._db.transaction((list) => {
            for (const c of list) {
                if (!c.id) continue;
                this._stmts.upsertContact.run(c.id, JSON.stringify(c));
            }
        });

        // Merge partial update fields into existing row (contacts.update sends patches)
        this._txContactsUpdate = this._db.transaction((list) => {
            for (const patch of list) {
                if (!patch.id) continue;
                const row = this._stmts.getContact.get(patch.id);
                const existing = row ? JSON.parse(row.data) : { id: patch.id };
                const merged = Object.assign({}, existing, patch);
                this._stmts.upsertContact.run(patch.id, JSON.stringify(merged));
            }
        });

        this._txChatsUpsert = this._db.transaction((list) => {
            for (const c of list) {
                if (!c.id) continue;
                this._stmts.upsertChat.run(c.id, JSON.stringify(c));
            }
        });

        // Merge partial update fields into existing row (chats.update sends patches)
        this._txChatsUpdate = this._db.transaction((list) => {
            for (const patch of list) {
                const id = patch.id || patch.key?.remoteJid;
                if (!id) continue;
                const row = this._stmts.getChat.get(id);
                const existing = row ? JSON.parse(row.data) : { id };
                const merged = Object.assign({}, existing, patch);
                this._stmts.upsertChat.run(id, JSON.stringify(merged));
            }
        });

        return this._db;
    }

    // Opens DB on startup — no JSON file needed anymore
    readFromFile() {
        this._getDb();
    }

    // No-op — SQLite writes are immediate
    writeToFile() {}

    bind(ev) {
        // ── Messages ────────────────────────────────────────────────────────
        ev.on('messages.upsert', ({ messages }) => {
            try { this._txMessages(messages); } catch {}
        });

        // ── Contacts ────────────────────────────────────────────────────────
        // Full list sent on startup
        ev.on('contacts.set', ({ contacts }) => {
            try { if (contacts?.length) this._txContactsUpsert(contacts); } catch {}
        });
        // New contacts added
        ev.on('contacts.upsert', (contacts) => {
            try { this._txContactsUpsert(contacts); } catch {}
        });
        // Partial field updates (name changes, profile pics, etc.)
        ev.on('contacts.update', (patches) => {
            try { this._txContactsUpdate(patches); } catch {}
        });

        // ── Chats ────────────────────────────────────────────────────────────
        ev.on('chats.upsert', (chats) => {
            try { this._txChatsUpsert(chats); } catch {}
        });
        // Partial field updates (unread count, mute, pin, etc.)
        ev.on('chats.update', (patches) => {
            try { this._txChatsUpdate(patches); } catch {}
        });

        // ── Group metadata ────────────────────────────────────────────────────
        ev.on('groups.update', (updates) => {
            try {
                const tx = this._db.transaction((list) => {
                    for (const g of list) {
                        if (!g.id) continue;
                        const row = this._stmts.getGroupMeta.get(g.id);
                        const existing = row ? JSON.parse(row.data) : { id: g.id };
                        this._stmts.upsertGroupMeta.run(g.id, JSON.stringify(Object.assign({}, existing, g)));
                    }
                });
                tx(updates);
            } catch {}
        });

        ev.on('group-participants.update', ({ id, participants, action }) => {
            try {
                if (!id) return;
                const row = this._stmts.getGroupMeta.get(id);
                if (!row) return;
                const meta = JSON.parse(row.data);
                if (!Array.isArray(meta.participants)) meta.participants = [];
                if (action === 'add') {
                    for (const p of participants) {
                        if (!meta.participants.find(x => x.id === p)) {
                            meta.participants.push({ id: p, admin: null });
                        }
                    }
                } else if (action === 'remove') {
                    meta.participants = meta.participants.filter(x => !participants.includes(x.id));
                } else if (action === 'promote') {
                    for (const x of meta.participants) {
                        if (participants.includes(x.id)) x.admin = 'admin';
                    }
                } else if (action === 'demote') {
                    for (const x of meta.participants) {
                        if (participants.includes(x.id)) x.admin = null;
                    }
                }
                this._stmts.upsertGroupMeta.run(id, JSON.stringify(meta));
            } catch {}
        });
    }

    // ── Hourly cleanup ────────────────────────────────────────────────────────
    cleanup() {
        try {
            const db = this._getDb();

            // Expire messages older than MSG_TTL_DAYS regardless of per-chat limit
            this._stmts.expireMsg.run(MSG_TTL_DAYS * 86400);

            // Trim total contact count
            if (this._stmts.countContacts.get().n > MAX_CONTACTS)
                this._stmts.pruneContacts.run(MAX_CONTACTS);

            // Trim total chat count
            if (this._stmts.countChats.get().n > MAX_CHATS)
                this._stmts.pruneChats.run(MAX_CHATS);

            // Trim group metadata cache
            if (this._stmts.countGroupMeta.get().n > MAX_GROUP_META)
                this._stmts.pruneGroupMeta.run(MAX_GROUP_META);

            // Fold WAL back so file size stays lean
            db.pragma('wal_checkpoint(TRUNCATE)');
        } catch {}
    }

    // ── Graceful shutdown ────────────────────────────────────────────────────
    close() {
        try {
            if (this._db) {
                this._db.pragma('wal_checkpoint(TRUNCATE)');
                this._db.close();
                this._db    = null;
                this._stmts = null;
            }
        } catch {}
    }

    // ── Lookups ──────────────────────────────────────────────────────────────
    loadMessage(jid, id) {
        try {
            const row = this._stmts.getMsg.get(jid, id);
            return row ? JSON.parse(row.data) : null;
        } catch { return null; }
    }

    getMessages(jid) {
        try {
            return this._stmts.getMsgs.all(jid, MAX_MESSAGES_PER_CHAT)
                .map(r => JSON.parse(r.data));
        } catch { return []; }
    }

    getContact(jid) {
        try {
            const row = this._stmts.getContact.get(jid);
            return row ? JSON.parse(row.data) : null;
        } catch { return null; }
    }

    getChat(jid) {
        try {
            const row = this._stmts.getChat.get(jid);
            return row ? JSON.parse(row.data) : null;
        } catch { return null; }
    }

    // Cache group metadata (call after fetching from WhatsApp if not cached)
    cacheGroupMeta(jid, meta) {
        try {
            this._getDb();
            this._stmts.upsertGroupMeta.run(jid, JSON.stringify(meta));
        } catch {}
    }

    getGroupMeta(jid) {
        try {
            this._getDb();
            const row = this._stmts.getGroupMeta.get(jid);
            return row ? JSON.parse(row.data) : null;
        } catch { return null; }
    }
}

const store = new LightweightStore();
module.exports = store;
