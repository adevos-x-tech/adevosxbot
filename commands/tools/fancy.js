'use strict';

const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'fancy',
    aliases: ['fancytext', 'stylish', 'fonts'],
    category: 'tools',
    description: 'Convert text into fancy Unicode styles',
    usage: '.fancy <text>  or  reply to a message with .fancy',
    execute: async (sock, message, args, context) => {
        const { chatId, senderId } = context;
        const botName = getBotName();
        const fake = createFakeContact(message);
        const p = global.prefix ?? '.';

        let query = args.join(' ').trim();
        if (!query) {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                query = (
                    quoted.conversation ||
                    quoted.extendedTextMessage?.text ||
                    quoted.imageMessage?.caption || ''
                ).trim();
            }
        }

        if (!query) {
            return sock.sendMessage(chatId, {
                text: buildFrame({
                  title: 'Fancy Text',
                  fields: [['How to use', `${p}fancy <text> or reply to text with ${p}fancy`]],
                  footer: 'Reply with a number to copy that style',
                })
            }, { quoted: fake });
        }

        if (query.length > 200) {
            return sock.sendMessage(chatId, { text: buildHint('Text too long! Max 200 characters.') }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        try {
            const { data } = await axios.get(
                `https://apis.prexzyvilla.site/tools/allstyles?text=${encodeURIComponent(query)}`,
                { timeout: 30000 }
            );

            if (!data.status || !data.styles || !data.styles.length) {
                return sock.sendMessage(chatId, { text: buildHint('No styles returned. Try again.') }, { quoted: fake });
            }

            const fields = data.styles.slice(0, 20).map((style, i) => [`${i + 1}. ${style.style_name}`, style.styled_text]);
            const caption = buildFrame({
              title: `Fancy Styles — "${data.original_text}"`,
              fields,
              footer: `Reply with a number (1-${Math.min(data.styles.length, 20)}) to get that style`,
            });

            const sent = await sock.sendMessage(chatId, { text: caption, ...replyOpts() }, { quoted: fake });
            const msgId = sent?.key?.id;
            const _rhKey = `${senderId}:${chatId}`;

            const handlerFn = async (replyMsg) => {
                const resp = (
                    replyMsg.message?.conversation ||
                    replyMsg.message?.extendedTextMessage?.text || ''
                ).trim();
                const num = parseInt(resp, 10);

                if (isNaN(num) || num < 1 || num > data.styles.length) return;

                if (msgId) global.replyHandlers.delete(msgId);
                global.replyHandlers.delete(_rhKey);

                await sock.sendMessage(chatId, { react: { text: '⏳', key: replyMsg.key } });
                try {
                    const selectedStyle = data.styles[num - 1];
                    const styledText = selectedStyle.styled_text;

                    if (!styledText) throw new Error('No result returned');

                    await sock.sendMessage(chatId, { text: styledText, ...replyOpts() }, { quoted: replyMsg });
                    await sock.sendMessage(chatId, { react: { text: '✅', key: replyMsg.key } });
                } catch (err) {
                    await sock.sendMessage(chatId, { text: buildHint(`Failed to generate style: ${err.message}`) }, { quoted: replyMsg });
                    await sock.sendMessage(chatId, { react: { text: '❌', key: replyMsg.key } });
                }
            };

            if (msgId) global.replyHandlers.set(msgId, handlerFn);
            global.replyHandlers.set(_rhKey, handlerFn);
            setTimeout(() => {
                if (msgId) global.replyHandlers.delete(msgId);
                global.replyHandlers.delete(_rhKey);
            }, 5 * 60 * 1000);

        } catch (err) {
            console.error('[fancy] error:', err.message);
            await sock.sendMessage(chatId, { text: buildHint(err.message) }, { quoted: fake });
            return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }
    }
}
];
