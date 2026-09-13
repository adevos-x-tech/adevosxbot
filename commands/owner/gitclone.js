const axios = require('axios');
const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');

const BOT_REPO = 'https://github.com/adevos-x-tech/adevosxbot';

module.exports = [
{
    name: 'gitclone',
    aliases: ['clone', 'sourcecode', 'zip'],
    category: 'owner',
    description: 'Download a GitHub repo as a ZIP file — no argument downloads the bot\'s own repo',
    usage: '.gitclone <github url> | .zip <repo>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);

      const url = args.join(' ').trim() || BOT_REPO;

      if (!url.includes('github.com')) {
        return sock.sendMessage(chatId, { text: buildHint('Invalid GitHub URL') }, { quoted: fake });
      }

      const gitRegex = /github\.com[\/:]([^\/:]+)\/(.+)/i;
      const match = url.match(gitRegex);
      if (!match) {
        return sock.sendMessage(chatId, { text: buildHint('Invalid GitHub URL format') }, { quoted: fake });
      }

      const [, username, repoPath] = match;
      const repo = repoPath.replace(/\.git$/, '').split('/')[0];

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const apiUrl = `https://api.github.com/repos/${username}/${repo}/zipball`;
        const headResponse = await axios.head(apiUrl, {
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          maxRedirects: 5
        });

        let filename = `${username}-${repo}.zip`;
        const cd = headResponse.headers['content-disposition'];
        if (cd) {
          const m2 = cd.match(/filename=(?:"(.+)"|([^;]+))/i);
          if (m2) filename = (m2[1] || m2[2] || filename);
        }
        if (!filename.endsWith('.zip')) filename += '.zip';

        await sock.sendMessage(chatId, {
          document: { url: apiUrl },
          fileName: filename,
          mimetype: 'application/zip',
          caption: `*${botName}*\n${username}/${repo}`,
          ...replyOpts()
        }, { quoted: fake });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (error) {
        let msg = 'Failed to download repository';
        if (error.response?.status === 404) msg = 'Repository not found';
        else if (error.response?.status === 403) msg = 'Rate limit exceeded, try later';
        else if (error.message?.includes('timeout')) msg = 'Request timed out';
        await sock.sendMessage(chatId, { text: buildHint(msg) }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }
    }
  }
];
