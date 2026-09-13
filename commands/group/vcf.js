const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

module.exports = [
{
    name: 'vcf',
    aliases: ['exportcontacts', 'getvcf'],
    category: 'group',
    description: 'Export all group members as a VCF contact file',
    usage: '.vcf | .vcf <group-id>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const targetId = (args[0] && /^\d{10,20}(-\d+)?@g\.us$/.test(args[0])) ? args[0]
        : chatId.endsWith('@g.us') ? chatId : null;

      if (!targetId) {
        return sock.sendMessage(chatId, { text: buildHint('Usage: .vcf <group-id>', 'Or run it inside a group') }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(targetId);
        const participants = meta.participants || [];

        let vcfContent = '';
        participants.forEach((p, i) => {
          const num = p.id.split('@')[0].split(':')[0];
          if (!/^\d{7,15}$/.test(num)) return; // skip unresolved @lid entries
          const name = p.notify || `Contact ${i + 1}`;
          vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;waid=${num}:+${num}\nEND:VCARD\n`;
        });

        if (!vcfContent) {
          return sock.sendMessage(chatId, { text: buildHint('No exportable contacts found') }, { quoted: fake });
        }

        const buf = Buffer.from(vcfContent, 'utf-8');
        return sock.sendMessage(chatId, {
          document: buf,
          fileName: `${meta.subject || 'group'}.vcf`,
          mimetype: 'text/vcard',
          caption: buildHint(`Exported ${participants.length} contact(s)`),
        }, { quoted: fake, ...replyOpts() });
      } catch (e) {
        return sock.sendMessage(chatId, { text: buildHint(`Failed: ${e.message}`) }, { quoted: fake });
      }
    }
  }
];
