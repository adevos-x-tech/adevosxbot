// unmute.js previously duplicated open.js entirely, and both files claimed
// the alias 'unlock' — undefined behavior, whichever loaded last would win.
// Per spec, unmute is just an alias for open, so it now lives there.
// See open.js.

module.exports = [];
