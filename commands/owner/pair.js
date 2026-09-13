const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const { sendWithCopy } = require('../../Adevoslib/interactive');

// ============================================================
// ASSUMPTION — needs verification against the real pair site API.
// I don't have the actual endpoint/response contract for
// https://pair.adevosxtech.site, so this assumes a common shape:
//   POST https://pair.adevosxtech.site/api/pair  { number: "255712345678" }
//   Success: { success: true, code: "ABCD1234" }
//   Failure: { success: false, message: "reason..." }
// If the real API differs (different path, GET instead of POST, a
// different field name for the code, etc.), only the PAIR_SITE_URL
// constant and the two lines marked below need to change.
// ============================================================
const PAIR_SITE_URL = 'https://pair.adevosxtech.site/api/pair';

module.exports = [
{
    name: 'pair',
    aliases: ['getpaircode', 'paircode'],
    category: 'owner',
    description: 'Request a WhatsApp pairing code from the pair site for a number',
    usage: '.pair <number>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: buildFrame({ title: botName, fields: [['Access', 'Owner only']] }) }, { quoted: fake });
      }

      const number = (args[0] || '').replace(/\D/g, '');

      // Basic local validation before even contacting the pair site.
      if (!number || number.length < 9 || number.length > 15) {
        return sock.sendMessage(chatId, {
          text: buildHint('Provide a valid number with country code (9-15 digits, no + or spaces)', '.pair 255712345678')
        }, { quoted: fake });
      }

      // Reject pairing the number that's already running THIS bot session.
      const currentBotNum = (sock.user?.id || '').split(':')[0].split('@')[0];
      if (number === currentBotNum) {
        return sock.sendMessage(chatId, {
          text: buildHint('That number already has this bot session active', 'Use a different number to pair a new session')
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        // --- If the real API contract differs, adjust this call ---
        const res = await axios.post(PAIR_SITE_URL, { number }, {
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
        });
        const data = res.data || {};

        if (!data.success) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
          return sock.sendMessage(chatId, {
            text: buildHint(`Pair site rejected the request: ${data.message || 'Unknown reason'}`)
          }, { quoted: fake });
        }

        const rawCode = data.code || data.pairingCode || data.pair_code;
        if (!rawCode) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
          return sock.sendMessage(chatId, { text: buildHint('Pair site did not return a code') }, { quoted: fake });
        }
        // --- end adjustable section ---

        const formatted = String(rawCode).match(/.{1,4}/g)?.join('-') || rawCode;

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        return sendWithCopy(sock, chatId, {
          text: buildFrame({
            title: 'Pairing Code',
            fields: [
              ['Code', formatted],
              ['For number', `+${number}`],
              ['How to pair', 'WhatsApp > Linked Devices > Link with phone number > enter this code'],
              ['Expires', 'Usually within a few minutes — pair quickly'],
            ],
          }),
          copyText: String(rawCode).replace(/-/g, ''),
          buttonLabel: 'Copy Code',
          quoted: fake,
        });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        const msg = e.response?.data?.message || e.message;
        return sock.sendMessage(chatId, { text: buildHint(`Failed to reach pair site: ${msg}`) }, { quoted: fake });
      }
    }
  }
];
