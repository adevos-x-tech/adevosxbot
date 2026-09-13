// lib/statusHelper.js — Adevos X Bot status helper (adapted from Dave-X statusHelper.js)
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// ─── Core poster ──────────────────────────────────────────────────────────────
async function postPersonalStatus(sock, content, statusJidList, extraOpts = {}) {
    const typeLabel = content.image ? 'image' : content.video ? 'video' : content.audio ? 'audio' : content.text ? 'text' : 'unknown';
    console.log(`[tostatus] ▶ Posting type=${typeLabel} to ${statusJidList.length} recipient(s)`);
    if (statusJidList.length === 0) {
        console.warn(`[tostatus] ⚠️  statusJidList is EMPTY — status will be invisible to everyone!`);
    } else {
        console.log(`[tostatus] 📋 Recipients: ${statusJidList.slice(0, 10).join(', ')}${statusJidList.length > 10 ? ` ... +${statusJidList.length - 10} more` : ''}`);
    }
    try {
        const result = await sock.sendMessage('status@broadcast', content, {
            ...extraOpts,
            statusJidList,
        });
        console.log(`[tostatus] ✅ sendMessage returned — key.id=${result?.key?.id || 'none'}`);
        return result;
    } catch (err) {
        console.error(`[tostatus] ❌ sendMessage failed: ${err.message}`);
        throw err;
    }
}

// ─── Media downloader ─────────────────────────────────────────────────────────
async function downloadStatusMedia(msgObj, type) {
    const stream = await downloadContentFromMessage(msgObj, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return {
        buffer: Buffer.concat(chunks),
        mimetype: msgObj.mimetype || (
            type === 'image'   ? 'image/jpeg'  :
            type === 'video'   ? 'video/mp4'   :
            type === 'audio'   ? 'audio/mp4'   :
            type === 'sticker' ? 'image/webp'  :
            'application/octet-stream'
        ),
    };
}

// ─── Quoted message → status content ─────────────────────────────────────────
async function processQuotedForStatus(quoted, captionOverride) {
    if (quoted.imageMessage) {
        const m = await downloadStatusMedia(quoted.imageMessage, 'image');
        return {
            content: { image: m.buffer, mimetype: m.mimetype, caption: captionOverride || quoted.imageMessage.caption || '' },
            mediaType: 'Image',
        };
    }
    if (quoted.videoMessage) {
        const m = await downloadStatusMedia(quoted.videoMessage, 'video');
        return {
            content: { video: m.buffer, mimetype: m.mimetype, caption: captionOverride || quoted.videoMessage.caption || '' },
            mediaType: 'Video',
        };
    }
    if (quoted.audioMessage) {
        const m = await downloadStatusMedia(quoted.audioMessage, 'audio');
        return {
            content: { audio: m.buffer, mimetype: m.mimetype || 'audio/mp4', ptt: quoted.audioMessage.ptt || false },
            mediaType: 'Audio',
        };
    }
    if (quoted.stickerMessage) {
        const m = await downloadStatusMedia(quoted.stickerMessage, 'sticker');
        return {
            content: { image: m.buffer, caption: captionOverride || '' },
            mediaType: 'Sticker',
        };
    }
    const text = quoted.conversation || quoted.extendedTextMessage?.text || '';
    const finalText = captionOverride ? `${text ? text + '\n\n' : ''}${captionOverride}` : text;
    return {
        content: { text: finalText },
        mediaType: 'Text',
    };
}

// ─── Normalize a phone JID ────────────────────────────────────────────────────
function normPhoneJid(jid) {
    if (!jid || typeof jid !== 'string') return null;
    if (!jid.endsWith('@s.whatsapp.net')) return null;
    return jid.replace(/:\d+@/, '@');
}

// ─── Build the statusJidList ──────────────────────────────────────────────────
// Collects all known phone JIDs from: store contacts, group participants, global.lidCache
let _jidCache = null;
let _jidCacheTs = 0;
const JID_CACHE_TTL = 15 * 60 * 1000;

async function buildStatusJidList(sock) {
    const rawId = sock.user?.id || '';
    const ownerNum = rawId.split('@')[0].split(':')[0];
    const ownerJid = ownerNum ? `${ownerNum}@s.whatsapp.net` : null;

    const now = Date.now();
    if (_jidCache && (now - _jidCacheTs) < JID_CACHE_TTL) {
        const result = new Set(_jidCache);
        if (ownerJid) result.add(ownerJid);
        const cached = Array.from(result);
        console.log(`[tostatus] 📦 Using cached JID list (${cached.length} contacts)`);
        return cached;
    }

    console.log(`[tostatus] 🔍 Building statusJidList from scratch...`);
    const jidSet = new Set();
    const store = global.store;

    // 1. DM message JIDs
    const dmKeys = Object.keys(store?.messages || {});
    let fromDms = 0;
    for (const jid of dmKeys) {
        if (jid.endsWith('@s.whatsapp.net')) {
            const n = normPhoneJid(jid);
            if (n) { jidSet.add(n); fromDms++; }
        }
    }
    console.log(`[tostatus]   ↳ DM chats: ${dmKeys.length} keys → ${fromDms} resolved`);

    // 2. Store contacts
    const contactKeys = Object.keys(store?.contacts || {});
    let fromContacts = 0, fromContactLid = 0;
    for (const jid of contactKeys) {
        if (jid.endsWith('@s.whatsapp.net')) {
            const n = normPhoneJid(jid); if (n) { jidSet.add(n); fromContacts++; }
        } else if (jid.endsWith('@lid')) {
            const lidNum = jid.split('@')[0].split(':')[0];
            const phone = global.lidCache?.get(lidNum);
            if (phone) { jidSet.add(`${phone}@s.whatsapp.net`); fromContactLid++; }
        }
    }
    console.log(`[tostatus]   ↳ Contacts: ${contactKeys.length} keys → ${fromContacts} phone + ${fromContactLid} via LID`);

    // 3. lidCache
    const lidEntries = [...(global.lidCache || new Map())];
    let fromLid = 0;
    for (const [, phone] of lidEntries) {
        if (phone) { jidSet.add(`${phone}@s.whatsapp.net`); fromLid++; }
    }
    console.log(`[tostatus]   ↳ LID cache: ${lidEntries.length} entries → ${fromLid} resolved`);

    // 4. Group participants
    let fromGroups = 0;
    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups || {});
        for (const group of groupList) {
            for (const p of (group.participants || [])) {
                const pjid = p.id || p.jid || '';
                if (pjid.endsWith('@s.whatsapp.net')) {
                    const n = normPhoneJid(pjid); if (n) { jidSet.add(n); fromGroups++; }
                } else if (pjid.endsWith('@lid')) {
                    const lidNum = pjid.split('@')[0].split(':')[0];
                    const phone = global.lidCache?.get(lidNum);
                    if (phone) { jidSet.add(`${phone}@s.whatsapp.net`); fromGroups++; }
                }
            }
        }
        console.log(`[tostatus]   ↳ Groups: ${groupList.length} groups → ${fromGroups} participants resolved`);
    } catch (err) {
        console.warn(`[tostatus]   ↳ Groups: fetch failed (${err.message})`);
    }

    if (ownerJid) jidSet.add(ownerJid);

    const list = Array.from(jidSet);
    console.log(`[tostatus] ✅ Total unique JIDs: ${list.length}`);
    _jidCache = list;
    _jidCacheTs = Date.now();
    return list;
}

module.exports = {
    postPersonalStatus,
    downloadStatusMedia,
    processQuotedForStatus,
    buildStatusJidList,
};
