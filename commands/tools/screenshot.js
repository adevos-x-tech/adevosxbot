'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'screenshot',
    aliases: ['ss', 'webss', 'scrop'],
    category: 'tools',
    description: 'Take a screenshot of any website',
    usage: '.screenshot <url>',
    execute: async (sock, message, args, context) => {
        const { chatId, senderId } = context;
        const fake = createFakeContact(message);

        const url = args.join(' ').trim();
        if (!url || !url.startsWith('http')) {
            return sock.sendMessage(chatId, { text: buildHint('Provide a valid URL', '.screenshot https://example.com') }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        try {
            const apis = [
                async () => {
                    const r = await axios.get(`https://eliteprotech-apis.zone.id/ssweb?url=${encodeURIComponent(url)}`, { timeout: 30000 });
                    const html = r.data;
                    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
                    if (imgMatch && imgMatch[1]) {
                        let imgUrl = imgMatch[1];
                        if (!imgUrl.startsWith('http')) {
                            imgUrl = 'https://eliteprotech-apis.zone.id' + imgUrl;
                        }
                        const img = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
                        return Buffer.from(img.data);
                    }
                    return null;
                },
                async () => {
                    const r = await axios.get(`https://apis.prexzyvilla.site/ssweb/webss?url=${encodeURIComponent(url)}`, { timeout: 30000 });
                    const data = r.data;
                    let imgUrl = null;
                    if (data.status && data.result) imgUrl = data.result;
                    else if (data.url) imgUrl = data.url;
                    else if (data.image) imgUrl = data.image;
                    if (imgUrl) {
                        const img = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
                        return Buffer.from(img.data);
                    }
                    return null;
                }
            ];

            let imgBuf = null;
            for (const api of apis) {
                try {
                    imgBuf = await api();
                    if (imgBuf && imgBuf.length > 5000) break;
                } catch (e) {
                    console.log('[screenshot] API failed:', e.message);
                }
            }

            if (!imgBuf || imgBuf.length < 5000) throw new Error('All screenshot APIs failed');

            await sock.sendMessage(chatId, { image: imgBuf, caption: `Screenshot: ${url.substring(0, 50)}` }, { quoted: fake });
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (e) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(chatId, { text: buildHint('Failed to take screenshot') }, { quoted: fake });
        }
    }
}
];
