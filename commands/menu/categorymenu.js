const { createFakeContact } = require('../../Adevoslib/messageConfig');
const { frameTop, frameClose, replyOpts } = require('../../Adevoslib/frame');

// Hardcoded category list — NOT derived from global.fileCategories at
// require-time, because this file loads alongside every other command
// file and global.fileCategories may not be fully populated yet depending
// on load order. The actual command listing for each category is still
// looked up live, at execution time, when it's guaranteed complete.
const CATEGORIES = [
  'owner', 'group', 'tools', 'sticker', 'games', 'fun',
  'ai', 'utility', 'audio', 'download',
];

function buildCategoryBox(cat) {
  const categories = global.fileCategories || {};
  const cmds = (categories[cat] || []).slice().sort();
  let body = frameTop(cat.toUpperCase()) + '\n';
  if (!cmds.length) {
    body += `│ (no commands found — bot may still be loading)\n`;
  } else {
    for (const cmd of cmds) body += `│ ${cmd}\n`;
  }
  body += frameClose() + '\n';
  return body;
}

module.exports = CATEGORIES.map(cat => ({
  name: `${cat}menu`,
  category: cat,
  description: `Show all ${cat} commands`,
  execute: async (sock, message, args, context) => {
    const { chatId } = context;
    const fake = createFakeContact(message);
    return sock.sendMessage(chatId, { text: buildCategoryBox(cat), ...replyOpts() }, { quoted: fake });
  }
}));
