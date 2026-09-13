/**
 * resolveTargets(message, args) — returns { targets: [jid,...], remainingArgs }
 * Priority: @mentions > reply-to-message > plain phone number in args[0].
 * `remainingArgs` is what's left of `args` after the target (and, for a
 * mention, its @tag) is consumed — e.g. the reason/message text.
 */
function resolveTargets(message, args = []) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;
  const mentions = ctx?.mentionedJid || [];
  const quotedParticipant = ctx?.participant;

  if (mentions.length) {
    // Drop the leading @number token(s) from args if present, so the rest
    // of args is the reason/message text.
    const remaining = args.filter(a => !a.startsWith('@'));
    return { targets: mentions, remainingArgs: remaining };
  }

  if (quotedParticipant) {
    return { targets: [quotedParticipant], remainingArgs: args };
  }

  // Plain phone number as the first arg, e.g. .warn 255712345678 spam
  const first = (args[0] || '').replace(/\D/g, '');
  if (first.length >= 7 && first.length <= 15) {
    const jid = `${first}@s.whatsapp.net`;
    return { targets: [jid], remainingArgs: args.slice(1) };
  }

  return { targets: [], remainingArgs: args };
}

module.exports = { resolveTargets };
