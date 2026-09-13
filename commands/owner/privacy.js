'use strict';

module.exports = {
  name: 'privacy',
  aliases: ['privacysettings'],
  category: 'owner',
  description: 'Show account privacy settings',
  ownerOnly: true,
  execute: async (sock, message, args, context) => {
    try {
      const settings = await sock.fetchPrivacySettings(true);
      const rows = [
        ['Online', settings.online],
        ['Profile picture', settings.profile],
        ['Last seen', settings.last],
        ['Read receipts', settings.readreceipts],
        ['Group add', settings.groupadd],
        ['Status', settings.status],
        ['Calls', settings.calladd],
      ].map(([label, value]) => `${label}: ${value ?? 'unknown'}`);
      return context.reply(`*Privacy settings*\n\n${rows.join('\n')}`);
    } catch (error) {
      return context.reply(`Could not read privacy settings: ${error.message}`);
    }
  },
};
