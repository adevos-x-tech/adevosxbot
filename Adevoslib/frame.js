/**
 * frame.js
 * Central reply-frame builder for Adevos-X Bot.
 * Produces the boxed layout used across all command replies:
 *
 * ╭─*`Title`*
 * ├─*Label:*
 * │    └ Value
 * ╰──*`Commands`*
 *           └ 1. cmd one
 *           └ 2. cmd two
 *
 * _Reply with numbers Or Use specific commands_
 *
 * Import the helpers you need and pass plain data in — no command file
 * should build box characters by hand anymore.
 */

const { getBotName, getFooter, getChannelInfo } = require('./messageConfig');

// ------------------------------------------------------------------
// Low level primitives
// ------------------------------------------------------------------

/** Top line of a frame: ╭─*`Title`* */
function frameTop(title) {
  return `╭─ *\`${title}\`*`;
}

/** A field row: ├─*Label:* \n│    └ Value */
function frameField(label, value) {
  return `├─ *${label}:*\n│    └ ${value}`;
}

/** A plain body line, no label, indented under the last field: │    └ text */
function frameLine(text) {
  return `│    └ ${text}`;
}

/** Bottom line that opens a labeled section: ╰──*`Label`* */
function frameFooterLabel(label) {
  return `╰── *\`${label}\`*`;
}

/** A numbered command row under a footer label: └ 1. text */
function frameCmd(n, text) {
  return `          └ ${n}. ${text}`;
}

/** Plain closing bar with no label: ╰────────────── */
function frameClose(width = 14) {
  return `╰${'─'.repeat(width)}`;
}

// ------------------------------------------------------------------
// High level builders
// ------------------------------------------------------------------

/**
 * buildFrame — generic status + commands frame.
 *
 * buildFrame({
 *   title: 'Antisticker',
 *   fields: [ ['Current', 'On'], ['Action', 'Delete'] ],
 *   commandsLabel: 'Commands',
 *   commands: ['antisticker off', 'antisticker set kick/Warn'],
 *   footer: 'Reply with numbers Or Use specific commands'
 * })
 */
function buildFrame({ title, fields = [], commandsLabel = 'Commands', commands = [], footer } = {}) {
  const lines = [frameTop(title)];

  fields.forEach(([label, value]) => {
    lines.push(frameField(label, value));
  });

  if (commands.length) {
    lines.push(frameFooterLabel(commandsLabel));
    commands.forEach((cmd, i) => lines.push(frameCmd(i + 1, cmd)));
  } else if (fields.length) {
    // convert the last field row's ├─ into ╰── if there are no commands
    lines[lines.length - 2] = lines[lines.length - 2].replace(/^├─/, '╰─');
  }

  let out = lines.join('\n');
  if (footer) out += `\n\n_${footer}_`;
  return appendFooter(out);
}

/**
 * buildInfoFrame — a boxed info card without numbered commands
 * (e.g. repo info, group info, alive/uptime).
 *
 * buildInfoFrame({
 *   title: 'Adevos-X Bot',
 *   fields: [ ['Forks', 12], ['Stars', 34] ],
 *   footerLabel: 'Visit on github',
 *   footerLines: ['Fork and Star the repo', 'Follow github account'],
 *   link: 'https://github.com/adevos-x-tech'
 * })
 */
function buildInfoFrame({ title, fields = [], footerLabel, footerLines = [], link } = {}) {
  const lines = [`╭─ *\`${title}\`*`, '│'];
  fields.forEach(([label, value]) => lines.push(`├─ *${label}:* ${value}`));
  if (footerLabel) {
    lines.push('│');
    lines.push(`╰──\`${footerLabel}\``);
    footerLines.forEach(l => lines.push(`       └ ${l}`));
  } else {
    lines.push(frameClose());
  }
  let out = lines.join('\n');
  if (link) out += `\n${link}`;
  return appendFooter(out);
}

/**
 * buildSimpleBox — the compact single-purpose box used for quick
 * confirmations (kick/warn/delete notices etc).
 *
 * buildSimpleBox('Antisticker', ['@user kicked!', 'Reason: sticker not allowed'])
 */
function buildSimpleBox(title, lines = []) {
  let out = frameTop(title) + '\n';
  for (const line of lines) out += `│ ${line}\n`;
  out += frameClose();
  return appendFooter(out);
}

/**
 * buildHint — the non-framed usage/instruction style:
 * *Bold instruction*
 *
 * _Example text_
 */
function buildHint(instruction, example) {
  let out = `*${instruction}*`;
  if (example) out += `\n\n_${example}_`;
  return appendFooter(out);
}

/**
 * withBotName — convenience: substitutes the current bot name into a title
 * when no explicit title is given (e.g. repo/alive/menu frames).
 */
function withBotName(title) {
  return title || getBotName();
}

/**
 * appendFooter — appends the user-configured footer (see footer.js) to any
 * text, respecting the on/off toggle. Frame builders call this internally
 * so command files don't need to think about it.
 */
function appendFooter(text) {
  const footer = getFooter();
  if (!footer) return text;
  return `${text}\n\n${footer}`;
}

/**
 * replyOpts — the message-options object to spread into sock.sendMessage()
 * so replies automatically pick up the current Bot Style (Normal/Forwarded).
 * Use like: sock.sendMessage(chatId, { text, ...replyOpts() }, { quoted })
 */
function replyOpts(extra = {}) {
  return { ...getChannelInfo(), ...extra };
}

module.exports = {
  // primitives
  frameTop,
  frameField,
  frameLine,
  frameFooterLabel,
  frameCmd,
  frameClose,
  // builders
  buildFrame,
  buildInfoFrame,
  buildSimpleBox,
  buildHint,
  appendFooter,
  replyOpts,
  withBotName,
};
