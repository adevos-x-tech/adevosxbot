'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'shorturl',
    aliases: ['shorten', 'tinyurl'],
    category: 'tools',
    description: 'Shorten a long URL',
    usage: '.shorturl <url>',
    execute: async (sock, message, args, context) => {
        const { chatId, senderId } = context;
        const fake = createFakeContact(message);

        let url = args.join(' ').trim();

        if (!url) {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                url = (quoted.conversation || quoted.extendedTextMessage?.text || '').trim();
            }
        }

        if (!url || !url.startsWith('http')) {
            return sock.sendMessage(chatId, { text: buildHint('Provide a valid URL', '.shorturl https://example.com') }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        try {
            const apis = [
                async () => {
                    const r = await axios.get(`https://trustbit.app/api/tools/spooMe?url=${encodeURIComponent(url)}`, { timeout: 10000 });
                    if (r.data?.status && r.data?.short_url) return r.data.short_url;
                    return null;
                },
                async () => {
                    const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 10000 });
                    if (typeof r.data === 'string' && r.data.startsWith('http')) return r.data;
                    return null;
                },
                async () => {
                    const r = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 10000 });
                    if (typeof r.data === 'string' && r.data.startsWith('http')) return r.data;
                    return null;
                }
            ];

            let short = null;
            for (const api of apis) {
                try {
                    short = await api();
                    if (short) break;
                } catch (e) {
                    console.log('[shorturl] API failed:', e.message);
                }
            }

            if (!short) throw new Error('All shorteners failed');

            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
            await sock.sendMessage(chatId, {
                text: buildFrame({
                  title: 'Shortened URL',
                  fields: [['Original', url.length > 60 ? url.substring(0, 60) + '...' : url], ['Short', short]],
                }),
                ...replyOpts()
            }, { quoted: fake });

        } catch (e) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(chatId, { text: buildHint('Failed to shorten URL') }, { quoted: fake });
        }
    }
}
];
