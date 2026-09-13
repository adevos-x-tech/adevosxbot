const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
const { postPersonalStatus, processQuotedForStatus, buildStatusJidList } = require('../../AdevosAuth/statusHelper');

module.exports = [
{
    name: 'reshare',
    aliases: ['repost', 'statusreshare'],
    category: 'owner',
    description: 'Reshare a viewed status as your own status',
    usage: '.reshare (reply to a status message)',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildHint('Owner only') }, { quoted: fake });
      }

      const statusJidList = await buildStatusJidList(sock);

      try {
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
                       || message.message?.imageMessage?.contextInfo?.quotedMessage
                       || null;
        if (!quotedMsg) {
          return sock.sendMessage(chatId, { text: buildHint('Reply to a status to reshare it') }, { quoted: fake });
        }
        const caption = args.join(' ').trim();
        const r = await processQuotedForStatus(quotedMsg, caption);
        if (!r || !r.content) {
          return sock.sendMessage(chatId, { text: buildHint('Could not extract status media') }, { quoted: fake });
        }
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        await postPersonalStatus(sock, r.content, statusJidList);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        return sock.sendMessage(chatId, { text: buildHint('Reshared as your status') }, { quoted: fake, ...replyOpts() });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
