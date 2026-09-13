const { getBotName, getBotStyle, getForwardedChannelName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting, updateSetting } = require('../../AdevosAuth/database');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
  {
    name: 'botstyle',
    aliases: ['setbotstyle'],
    category: 'owner',
    description: 'Switch bot reply style between Normal and Forwarded',
    usage: '.botstyle normal | .botstyle forwarded',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const fake = createFakeContact(message);
      const botName = getBotName();

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] })
        }, { quoted: fake });
      }

      const choice = (args[0] || '').toLowerCase();

      if (!choice) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Bot Style',
            fields: [
              ['Current', getBotStyle() === 'forwarded' ? 'Forwarded' : 'Normal'],
              ['Channel name', getForwardedChannelName()],
            ],
            commands: ['botstyle normal', 'botstyle forwarded'],
            footer: 'Reply with numbers Or Use specific commands',
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (!['normal', 'forwarded'].includes(choice)) {
        return sock.sendMessage(chatId, { text: buildHint('Use: .botstyle normal or .botstyle forwarded') }, { quoted: fake });
      }

      updateSetting('botstyle', choice);
      return sock.sendMessage(chatId, {
        text: buildHint(`Bot style set to ${choice === 'forwarded' ? 'Forwarded' : 'Normal'}`)
      }, { quoted: fake, ...replyOpts() });
    }
  },
  {
    name: 'setforwardedchannel',
    aliases: ['forwardedchannel'],
    category: 'owner',
    description: 'Set the channel name shown when Bot Style is Forwarded',
    usage: '.setforwardedchannel <name> | .setforwardedchannel reset',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const fake = createFakeContact(message);
      const botName = getBotName();

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] })
        }, { quoted: fake });
      }

      const arg = (args[0] || '').toLowerCase();

      if (!args.length) {
        return sock.sendMessage(chatId, {
          text: buildFrame({
            title: 'Forwarded Channel',
            fields: [['Current', getForwardedChannelName()]],
            commands: ['setforwardedchannel <name>', 'setforwardedchannel reset'],
          })
        }, { quoted: fake, ...replyOpts() });
      }

      if (arg === 'reset') {
        updateSetting('forwardedChannelName', null);
        return sock.sendMessage(chatId, {
          text: buildHint('Forwarded channel name reset to default', getForwardedChannelName())
        }, { quoted: fake, ...replyOpts() });
      }

      const name = args.join(' ').trim();
      updateSetting('forwardedChannelName', name);
      return sock.sendMessage(chatId, { text: buildHint('Forwarded channel name set to', name) }, { quoted: fake, ...replyOpts() });
    }
  }
];
