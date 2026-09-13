const { getBotName, createFakeContact } = require('../../Adevoslib/messageConfig');
const { buildFrame, buildHint, replyOpts } = require('../../Adevoslib/frame');
const axios = require('axios');

const REPO_URL = 'https://api.github.com/repos/adevos-x-tech/adevosxbot;

module.exports = [
{
    name: 'github',
    aliases: ['repo', 'script'],
    category: 'utility',
    description: 'Get Adevos-X Bot repository info',
    usage: '.github',
    execute: async (sock, message, args, context) => {
        const { chatId, senderId } = context;
        const botName = getBotName();
        const fake = createFakeContact(message);

        try {
            const repoRes = await axios.get(REPO_URL, { headers: { 'User-Agent': 'Adevos-X Bot' }, timeout: 10000 });
            const repo = repoRes.data;

            const commitsRes = await axios.get(`${REPO_URL}/commits?per_page=1`, { headers: { 'User-Agent': 'Adevos X Bot' }, timeout: 10000 });
            const lastCommit = commitsRes.data[0];

            const lastUpdate = new Date(repo.updated_at).toLocaleDateString();
            const commitDate = lastCommit ? new Date(lastCommit.commit.author.date).toLocaleDateString() : 'N/A';
            const commitMsg = lastCommit ? lastCommit.commit.message.split('\n')[0].substring(0, 60) : 'N/A';

            const text = buildFrame({
                title: `${repo.name}`,
                fields: [
                    ['Description', repo.description?.substring(0, 80) || 'No description'],
                    ['Stars', String(repo.stargazers_count)],
                    ['Forks', String(repo.forks_count)],
                    ['Watchers', String(repo.watchers_count)],
                    ['Open issues', String(repo.open_issues_count)],
                    ['Latest commit', commitMsg],
                    ['Commit date', commitDate],
                    ['Repo updated', lastUpdate],
                    ['Link', repo.html_url],
                ],
                commands: ['Zip — Get a downloadable zip'],
                footer: 'Reply with 1 to get a zip',
            });

            let sent;
            try {
                const avatarRes = await axios.get(repo.owner.avatar_url, { responseType: 'arraybuffer', timeout: 10000 });
                sent = await sock.sendMessage(chatId, { image: Buffer.from(avatarRes.data, 'binary'), caption: text, ...replyOpts() }, { quoted: fake });
            } catch {
                sent = await sock.sendMessage(chatId, { text, ...replyOpts() }, { quoted: fake });
            }

            if (!global.replyHandlers) global.replyHandlers = new Map();
            const handlerKey = sent?.key?.id;
            if (handlerKey) {
              global.replyHandlers.set(handlerKey, async (replyMsg) => {
                global.replyHandlers.delete(handlerKey);
                const replySender = replyMsg.key.participant || replyMsg.key.remoteJid;
        // NOTE: sender check intentionally removed — stanzaId match already
        // proves this is a genuine reply to this exact bot message; LID vs
        // phone-number JIDs for the same person cannot be reliably compared.
                const t = (replyMsg.message?.extendedTextMessage?.text || replyMsg.message?.conversation || '').trim();
                const leadNum = (t.match(/^\d+/) || [])[0];
                if (leadNum !== '1') return;
                const zipUrl = `${repo.html_url}/archive/refs/heads/${repo.default_branch}.zip`;
                await sock.sendMessage(chatId, {
                  document: { url: zipUrl },
                  fileName: `${repo.name}.zip`,
                  mimetype: 'application/zip',
                  caption: buildHint('Repo zip', zipUrl),
                }, { quoted: fake, ...replyOpts() });
              });
              setTimeout(() => global.replyHandlers?.delete(handlerKey), 120000);
            }
        } catch (e) {
            const msg = e.response?.status === 404 ? 'Repo not found' : e.message;
            await sock.sendMessage(chatId, { text: buildHint(`Failed to fetch repo: ${msg}`) }, { quoted: fake });
        }
    }
}
];
