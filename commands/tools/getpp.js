const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { isLidJid, resolvePhoneFromLid } = require('../../AdevosAuth/lidResolver');
const { buildHint } = require('../../Adevoslib/frame');
const { resolveTargets } = require('../../Adevoslib/resolveTarget');

module.exports = [
  {
    name: 'getpp',
    aliases: ['pfp', 'profilepic', 'dp'],
    category: 'tools',
    description: 'Get a profile picture — mention, reply, or give a number',
    usage: '.getpp @user | .getpp 255... | reply to a message with .getpp',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const { targets } = resolveTargets(message, args);
      const target = targets[0];

      if (!target) {
        return sock.sendMessage(chatId, { text: buildHint('Mention someone, reply, or give a number', 'Usage: .getpp @user') }, { quoted: fake });
      }

      try {
        let resolvedTarget = target;
        let displayNum = target.split('@')[0];
        if (isLidJid(target)) {
          const resolved = resolvePhoneFromLid(target, sock);
          if (resolved && /^\d{7,15}$/.test(resolved)) {
            resolvedTarget = `${resolved}@s.whatsapp.net`;
            displayNum = resolved;
          } else {
            displayNum = 'a member';
          }
        }

        let profilePic;
        try {
          profilePic = await sock.profilePictureUrl(resolvedTarget, 'image');
        } catch {
          profilePic = 'https://files.catbox.moe/lvcwnf.jpg';
        }

        const caption = displayNum === 'a member' ? 'Profile picture' : `Profile picture — +${displayNum}`;
        const ppMentions = resolvedTarget !== target ? [resolvedTarget] : [target];
        await sock.sendMessage(chatId, { image: { url: profilePic }, caption, mentions: ppMentions }, { quoted: fake });
      } catch (err) {
        await sock.sendMessage(chatId, { text: buildHint("Couldn't fetch profile picture", 'The user may have privacy settings on') }, { quoted: fake });
      }
    }
  }
];
