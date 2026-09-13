// This file previously duplicate-registered 'setmenuimg' with aliases
// ['menuimage', 'setmenuimage'] — the exact same name/aliases as the
// `setmenuimage` command in setmenuimage.js. Two command files claiming
// the same command name is undefined behavior (whichever loads last wins,
// silently shadowing the other). It also contained ~260 lines of dead
// code duplicated from menu.js (generateMenuText/sendMenu) that was never
// called from here.
//
// Everything this file did now lives in setmenuimage.js, including
// support for reply-to-video/audio/sticker and mention-based profile
// pictures that this file never had. No commands are exported here to
// avoid re-introducing the duplicate registration.

module.exports = [];
