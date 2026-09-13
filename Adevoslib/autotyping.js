const { getSetting } = require('../AdevosAuth/database');

const _activeTyping = new Map(); // chatId -> interval handle

function stopAllIntervals() {
  for (const [, handle] of _activeTyping) clearTimeout(handle);
  _activeTyping.clear();
}

/**
 * handleAutotypingForMessage — called on every incoming message (from
 * case.js -> main.js). Shows a "typing..." presence in the chat for a
 * few seconds if autotyping is enabled for that chat type (DM/group).
 */
async function handleAutotypingForMessage(sock, chatId) {
  try {
    const cfg = getSetting('autotyping', { enabled: false, pm: false, group: false });
    if (!cfg.enabled) return;
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup && !cfg.group) return;
    if (!isGroup && !cfg.pm) return;

    if (_activeTyping.has(chatId)) return; // already showing typing for this chat
    await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

    const timeout = setTimeout(async () => {
      _activeTyping.delete(chatId);
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    }, 4000);
    _activeTyping.set(chatId, timeout);
  } catch (_) {}
}

module.exports = { handleAutotypingForMessage, stopAllIntervals };
