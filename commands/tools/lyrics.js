'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'lyrics',
    aliases: ['lyric', 'songlyrics'],
    category: 'tools',
    description: 'Fetch lyrics for a song',
    usage: '.lyrics <song name>',
    execute: async (sock, message, args, context) => {
        const { chatId } = context;
        const fake = createFakeContact(message);
        const songTitle = args.join(' ').trim();

        if (!songTitle) {
            return sock.sendMessage(chatId, { text: buildHint('Usage: .lyrics <song name>', '.lyrics Never Gonna Give You Up') }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        try {
            const res = await axios.get(`https://api.drexapp.space/search/lyrics?q=${encodeURIComponent(songTitle)}`, { timeout: 15000 });
            const data = res.data;

            if (!data.status || !data.result) {
                await sock.sendMessage(chatId, { text: buildHint(`No lyrics found for "${songTitle}"`) }, { quoted: fake });
                return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            }

            const result = data.result;
            const title = result.title || songTitle;
            const artist = result.artist || 'Unknown Artist';
            let lyrics = result.lyrics || '';

            lyrics = lyrics.replace(/<[^>]*>/g, '');
            lyrics = lyrics.replace(/Contributors.*?Lyrics/i, '');
            lyrics = lyrics.replace(/Read More\s*/i, '');

            if (lyrics.length > 3800) {
                lyrics = lyrics.substring(0, 3750) + '\n\n... (truncated)';
            }

            const responseText = buildFrame({ title: `${title} — ${artist}`, fields: [['Lyrics', lyrics], ['Source', 'Genius']] });

            await sock.sendMessage(chatId, { text: responseText, ...replyOpts() }, { quoted: fake });
            return sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (err) {
            console.error('[lyrics] error:', err.message);
            await sock.sendMessage(chatId, { text: buildHint('Failed to fetch lyrics. Try a different song name.') }, { quoted: fake });
            return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }
    }
}
];
