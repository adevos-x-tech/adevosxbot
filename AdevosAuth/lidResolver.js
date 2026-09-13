'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  lib/lidResolver.js  — LID → Real Phone Number  (Dave-X pattern)
//  globalLidMapping is populated automatically by davexbaileys on every
//  incoming message decode — no signalRepository dependency needed.
// ─────────────────────────────────────────────────────────────────────────────

let _globalLidMapping = null;
let _glmHooked = false;
function _getGLM() {
    if (_globalLidMapping) return _globalLidMapping;
    try {
        const { globalLidMapping } = require('@whiskeysockets/baileys/lib/Utils');
        _globalLidMapping = globalLidMapping;
        // Hook into globalLidMapping.set so every Baileys decode auto-fills our cache
        if (!_glmHooked && _globalLidMapping && typeof _globalLidMapping.set === 'function') {
            const _origSet = _globalLidMapping.set.bind(_globalLidMapping);
            _globalLidMapping.set = function(lidJid, pnJid) {
                try {
                    const lid = String(lidJid).split('@')[0].split(':')[0];
                    const pn  = String(pnJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                    if (/^\d{7,15}$/.test(pn) && pn !== lid) cacheLidPhone(lid, pn);
                } catch {}
                return _origSet(lidJid, pnJid);
            };
            _glmHooked = true;
        }
    } catch { _globalLidMapping = null; }
    return _globalLidMapping;
}
// Trigger hook setup immediately on module load
setTimeout(() => _getGLM(), 2000);

const lidPhoneCache = new Map();   // lid-number  → phone-number
const phoneLidCache = new Map();   // phone-number → lid-number
const MAX_LID_CACHE  = 500;

function _capMap(map, max) {
    if (map.size <= max) return;
    const excess = map.size - Math.floor(max * 0.6);
    let i = 0;
    for (const k of map.keys()) {
        if (i++ >= excess) break;
        map.delete(k);
    }
}

function cacheLidPhone(lidNum, phoneNum) {
    if (!lidNum || !phoneNum || lidNum === phoneNum) return;
    if (!/^\d{7,15}$/.test(phoneNum)) return;
    lidPhoneCache.set(lidNum, phoneNum);
    phoneLidCache.set(phoneNum, lidNum);
    _capMap(lidPhoneCache, MAX_LID_CACHE);
    _capMap(phoneLidCache, MAX_LID_CACHE);
}

function isLidJid(jid) {
    if (!jid) return false;
    return jid.endsWith('@lid') || jid.includes('@lid:');
}

// ── Sync Layer 1: globalLidMapping + in-memory cache (zero network) ──────────
function resolvePhoneFromLid(jid, _sock) {
    if (!jid) return null;
    const lidNum = jid.split('@')[0].split(':')[0];

    const cached = lidPhoneCache.get(lidNum);
    if (cached) return cached;

    if (global.lidCache && global.lidCache.has(lidNum)) {
        const phone = global.lidCache.get(lidNum);
        cacheLidPhone(lidNum, phone);
        return phone;
    }

    const glm = _getGLM();
    if (glm) {
        for (const fmt of [jid, `${lidNum}@lid`, `${lidNum}:0@lid`]) {
            try {
                const pn = glm.getPnFromLid(fmt);
                if (pn) {
                    const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
                    if (num.length >= 7 && num.length <= 15 && num !== lidNum) {
                        cacheLidPhone(lidNum, num);
                        return num;
                    }
                }
            } catch {}
        }
    }

    return null;
}

// ── Async Layer 2: group metadata scan (only when sync fails) ─────────────────
async function resolveSenderFromGroup(senderJid, chatId, sock) {
    if (!senderJid || !chatId || !sock) return null;
    const lidNum = senderJid.split('@')[0].split(':')[0];

    const fast = lidPhoneCache.get(lidNum);
    if (fast) return fast;

    try {
        const metadata = await sock.groupMetadata(chatId);
        for (const p of (metadata?.participants || [])) {
            const pid  = p.id  || '';
            const plid = p.lid || '';

            let phoneNum = (p.phoneNumber && String(p.phoneNumber).replace(/[^0-9]/g, '')) || null;
            if (!phoneNum && !pid.includes('@lid')) {
                phoneNum = pid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            }
            if (!phoneNum && plid && !plid.includes('@lid')) {
                phoneNum = plid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            }
            if (phoneNum && (phoneNum.length < 7 || phoneNum.length > 15)) phoneNum = null;

            let participantLid = null;
            if (pid.includes('@lid'))  participantLid = pid.split('@')[0].split(':')[0];
            if (!participantLid && plid.includes('@lid'))
                participantLid = plid.split('@')[0].split(':')[0];

            if (phoneNum && participantLid) cacheLidPhone(participantLid, phoneNum);
        }
    } catch {}

    return lidPhoneCache.get(lidNum) || null;
}

// ── Master resolver — call from message handler ───────────────────────────────
// Returns the real phone number string (digits only), or null if unresolvable.
// Layer 0: message.key.participantPn / senderPn  (custom davexbaileys field)
// Layer 1: globalLidMapping + in-memory cache
// Layers 2-4: async background (store, group metadata) — populates cache only
async function resolveSenderNumber(jid, message, chatId, sock, store) {
    if (!jid) return null;
    const raw = jid.split('@')[0].split(':')[0];

    if (!isLidJid(jid)) return raw;

    // Layer 0
    const keyPn = message?.key?.participantPn || message?.key?.senderPn;
    if (keyPn) {
        const num = String(keyPn).split('@')[0].replace(/[^0-9]/g, '');
        if (/^\d{7,15}$/.test(num) && num !== raw) {
            cacheLidPhone(raw, num);
            return num;
        }
    }

    // Layer 1
    const sync = resolvePhoneFromLid(jid, sock);
    if (sync) return sync;

    // Layers 2-4: background — don't await, just populate cache
    setImmediate(async () => {
        try {
            const glm = _getGLM();
            if (glm) {
                for (const fmt of [jid, `${raw}@lid`, `${raw}:0@lid`]) {
                    try {
                        const pn = glm.getPnFromLid(fmt);
                        if (pn) {
                            const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
                            if (num.length >= 7 && num.length <= 15 && num !== raw) {
                                cacheLidPhone(raw, num); return;
                            }
                        }
                    } catch {}
                }
            }
            const contacts = store?.contacts || {};
            const contact = contacts[jid] || contacts[`${raw}@s.whatsapp.net`];
            if (contact?.id) {
                const cnum = contact.id.split('@')[0].split(':')[0];
                if (/^\d{7,15}$/.test(cnum) && cnum !== raw) { cacheLidPhone(raw, cnum); return; }
            }
            if (chatId?.endsWith('@g.us') && sock) {
                try {
                    const meta = await sock.groupMetadata(chatId);
                    for (const p of (meta?.participants || [])) {
                        const pLid  = (p.lid || '').split('@')[0].split(':')[0];
                        const pPhone = (p.id  || '').split('@')[0].split(':')[0];
                        if (pLid === raw && /^\d{7,15}$/.test(pPhone) && pPhone !== raw) {
                            cacheLidPhone(raw, pPhone); return;
                        }
                    }
                } catch {}
            }
        } catch {}
    });

    return null; // unresolved — caller should display LID or fallback
}

// ── Display helper ────────────────────────────────────────────────────────────
// Returns "+254XXXXXXXXX" for resolved, "+??(LID)" for unresolved LIDs
function numberDisplay(resolvedPhone, originalJid) {
    if (resolvedPhone && resolvedPhone !== originalJid?.split('@')[0]?.split(':')[0]) {
        return `+${resolvedPhone}`;
    }
    const raw = (originalJid || '').split('@')[0].split(':')[0];
    if (isLidJid(originalJid || '')) return `+??(LID:${raw.slice(0, 8)}...)`;
    return `+${raw}`;
}

module.exports = {
    isLidJid,
    cacheLidPhone,
    resolvePhoneFromLid,
    resolveSenderFromGroup,
    resolveSenderNumber,
    numberDisplay,
    lidPhoneCache,
    phoneLidCache,
};
