const { getSetting } = require('../AdevosAuth/database');

const _activeRecording = new Map(); // chatId -> timeout handle

function stopAllIntervals() {
  for (const [, handle] of _activeRecording) clearTimeout(handle);
  _activeRecording.clear();
}

/**
 * handleAutorecordingForMessage — called on every incoming message (from
 * case.js -> main.js). Shows a "recording..." presence in the chat for a
 * few seconds if autorecording is enabled for that chat type (DM/group).
 */
async function handleAutorecordingForMessage(sock, chatId) {
  try {
    const cfg = getSetting('autorecording', { enabled: false, pm: false, group: false });
    if (!cfg.enabled) return;
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup && !cfg.group) return;
    if (!isGroup && !cfg.pm) return;

    if (_activeRecording.has(chatId)) return;
    await sock.sendPresenceUpdate('recording', chatId).catch(() => {});

    const timeout = setTimeout(async () => {
      _activeRecording.delete(chatId);
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    }, 4000);
    _activeRecording.set(chatId, timeout);
  } catch (_) {}
}

module.exports = { handleAutorecordingForMessage, stopAllIntervals };
