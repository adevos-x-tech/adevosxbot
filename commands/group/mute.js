// mute.js previously duplicated close.js entirely, and both files claimed
// the alias 'lock' — undefined behavior, whichever loaded last would win.
// Per spec, mute is just an alias for close, so it now lives there.
// See close.js.

module.exports = [];
