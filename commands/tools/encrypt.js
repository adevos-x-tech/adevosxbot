'use strict';

const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'encrypt',
    aliases: ['obfuscate', 'obf', 'jsencrypt'],
    category: 'tools',
    description: 'Obfuscate JavaScript code',
    usage: '.encrypt <code>  or  reply to a code message',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      // 10-second cooldown per user
      if (!global._obfCooldown) global._obfCooldown = new Map();
      const now = Date.now();
      const last = global._obfCooldown.get(senderId) || 0;
      if (now - last < 10000) {
        const wait = Math.ceil((10000 - (now - last)) / 1000);
        return sock.sendMessage(chatId, { text: buildHint(`Please wait ${wait}s before using this again`) }, { quoted: fake });
      }

      // Resolve code — inline → quoted fallback
      let code = args.join(' ').trim();
      if (!code) {
        const qMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (qMsg) {
          code = (
            qMsg.conversation ||
            qMsg.extendedTextMessage?.text ||
            qMsg.imageMessage?.caption ||
            qMsg.videoMessage?.caption ||
            qMsg.documentMessage?.caption || ''
          ).trim();
        }
      }

      if (!code) {
        return sock.sendMessage(chatId, {
          text: buildFrame({ title: 'Obfuscate', commands: ['encrypt <javascript code>', 'reply to code with .encrypt'] })
        }, { quoted: fake });
      }

      let Obfuscator;
      try { Obfuscator = require('javascript-obfuscator'); } catch {
        return sock.sendMessage(chatId, { text: buildHint('Obfuscator module not available') }, { quoted: fake });
      }

      global._obfCooldown.set(senderId, now);
      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const result = Obfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 1,
          numbersToExpressions: true,
          simplify: true,
          stringArrayShuffle: true,
          splitStrings: true,
          stringArrayThreshold: 1
        });
        const obf = result.getObfuscatedCode();

        if (obf.length > 4000) {
          const buf = Buffer.from(obf, 'utf-8');
          await sock.sendMessage(chatId, {
            document: buf,
            fileName: 'obfuscated.js',
            mimetype: 'application/javascript',
            caption: `Obfuscated code (${obf.length} chars) — ${botName}`
          }, { quoted: fake });
        } else {
          await sock.sendMessage(chatId, { text: obf, ...replyOpts() }, { quoted: fake });
        }
        return sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { text: buildHint('Failed to obfuscate. Make sure it is valid JS.') }, { quoted: fake });
        return sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }
    }
  }
];
