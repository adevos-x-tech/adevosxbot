const { getBotName, getOwnerName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { getSetting } = require('../../AdevosAuth/database');
const { buildHint } = require('../../Adevoslib/frame');

module.exports = [
{
  name: 'owner',
  category: 'utility',
  description: 'Show bot owner info',
  execute: async (sock, message, args, context) => {
    const { chatId, senderId } = context;
    const ownerName = getOwnerName();
    const fake = createFakeContact(message);
    const ownerNum = getSetting('ownerNumber', '');
    const cleanNumber = String(ownerNum).replace(/[^0-9]/g, '');

    if (!cleanNumber) {
      return sock.sendMessage(chatId, { text: buildHint('Owner number not set') }, { quoted: fake });
    }

    const vCard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${ownerName}`,
      `TEL;waid=${cleanNumber}:+${cleanNumber}`,
      'END:VCARD'
    ].join('\n');

    await sock.sendMessage(chatId, {
      contacts: { displayName: ownerName, contacts: [{ vcard: vCard }] }
    }, { quoted: fake });
  }
}
];
