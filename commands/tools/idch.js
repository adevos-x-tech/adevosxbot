'use strict';

const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendWithCopy } = require('../../Adevoslib/interactive');

module.exports = [
{
    name: 'idch',
    aliases: ['cekid', 'channelid', 'chinfo'],
    category: 'tools',
    description: 'Get WhatsApp channel info from link',
    usage: '.idch <channel url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const fake = createFakeContact(message);
      const url = args.join(' ').trim();

      if (!url || !url.includes('whatsapp.com/channel/')) {
        return sock.sendMessage(chatId, {
          text: buildHint('Provide a WhatsApp channel link', '.idch https://whatsapp.com/channel/xxx')
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const inviteCode = url.split('/channel/')[1]?.split('?')[0]?.trim();
        if (!inviteCode) throw new Error('Invalid channel URL format');

        const meta = await sock.newsletterMetadata('invite', inviteCode);
        if (!meta) throw new Error('Could not fetch channel data');

        const id          = meta?.id || 'Unknown';
        const name        = meta?.name || meta?.thread_metadata?.name?.text || meta?.title || 'Unknown';
        const rawSubs     = meta?.subscribers ?? meta?.thread_metadata?.subscribers_count ?? meta?.follower_count;
        const followers   = typeof rawSubs === 'number' ? rawSubs.toLocaleString() : (rawSubs ?? 'Unknown');
        const rawVerif    = meta?.verification || meta?.thread_metadata?.verification || '';
        const verified    = rawVerif === 'VERIFIED' ? 'Yes' : 'No';
        const desc        = meta?.description || meta?.thread_metadata?.description?.text || meta?.desc || 'N/A';
        const channelLink = `https://whatsapp.com/channel/${inviteCode}`;

        await sendWithCopy(sock, chatId, {
          text: buildFrame({
            title: 'Channel Info',
            fields: [
              ['ID', id],
              ['Name', name],
              ['Followers', followers],
              ['Verified', verified],
              ['About', `${String(desc).substring(0, 120)}${String(desc).length > 120 ? '...' : ''}`],
              ['Link', channelLink],
            ],
          }),
          copyText: id,
          buttonLabel: 'Copy JID',
          quoted: fake,
        });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${err.message}`) }, { quoted: fake });
      }
    }
  }
];
