const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getBotName, createFakeContact, channelInfo } = require('../../Adevoslib/messageConfig');
const { buildHint, replyOpts } = require('../../Adevoslib/frame');
const { getSetting } = require('../../AdevosAuth/database');

const AXIOS_OPTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  }
};

async function tryRequest(fn, attempts = 2) {
  let err;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500)); }
  }
  throw err;
}

async function downloadBuffer(url, timeout = 90000) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Invalid media URL');
  const res = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout,
    headers: AXIOS_OPTS.headers,
    maxRedirects: 5,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength: 100 * 1024 * 1024,
    validateStatus: () => true
  });
  const buf = Buffer.from(res.data || []);
  const type = String(res.headers?.['content-type'] || '').toLowerCase();
  if (res.status < 200 || res.status >= 300 || buf.length < 5000 || type.includes('text/html') || type.includes('application/json')) {
    throw new Error(`Media fetch failed (${res.status || 'no status'})`);
  }
  const header = buf.slice(0, 80).toString().toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html') || header.trimStart().startsWith('{')) throw new Error('Invalid media response');
  return buf;
}

const KEITH_BASE = 'https://apiskeith2-production-3020.up.railway.app';
const KEITH_AUDIO_ENDPOINTS = ['audio', 'ytmp3', 'dlmp3', 'mp3', 'yta', 'yta2', 'yta3', 'yta4', 'yta5'];
const KEITH_VIDEO_ENDPOINTS = ['video', 'ytmp4', 'dlmp4', 'mp4', 'ytv', 'ytv2', 'ytv3', 'ytv4', 'ytv5'];
const KEITH_TIKTOK_ENDPOINTS = ['tiktokdl3'];
const KEITH_INSTAGRAM_ENDPOINTS = ['instadl', 'instagramdl'];
const KEITH_FACEBOOK_ENDPOINTS = ['fbdown', 'fbdl'];
const KEITH_TWITTER_ENDPOINTS = ['twitter'];
const KEITH_PINTEREST_ENDPOINTS = ['pinterest', 'pindl2', 'pindl3'];
const KEITH_MEDIAFIRE_ENDPOINTS = ['mfire'];
const KEITH_SPOTIFY_ENDPOINTS = ['spotify'];

function extractMediaUrl(value, seen = new Set(), depth = 0) {
  if (!value || depth > 5 || seen.has(value)) return '';
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : '';
  if (typeof value !== 'object') return '';
  seen.add(value);
  for (const key of ['download_url', 'downloadUrl', 'media_url', 'mediaUrl', 'video_hd', 'video_sd', 'video', 'audio', 'url', 'image', 'image_url', 'link', 'hd', 'sd', 'play', 'wmplay']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const key of ['result', 'data', 'items', 'media', 'images', 'videos', 'url_list']) {
    const found = extractMediaUrl(value[key], seen, depth + 1);
    if (found) return found;
  }
  return '';
}

async function requestKeith(endpoint, input, timeout = 45000) {
  if (!input) return null;
  try {
    const res = await axios.get(`${KEITH_BASE}/download/${endpoint}`, {
      params: { url: input },
      timeout,
      headers: AXIOS_OPTS.headers
    });
    const data = res.data || {};
    if (data.status === false) return null;
    const raw = data.result ?? data.data ?? data;
    const url = extractMediaUrl(raw);
    if (!url) return null;
    return { url, title: data.title || raw?.title || raw?.name || '', raw, endpoint };
  } catch {
    return null;
  }
}

async function keithFirstMedia(endpoints, input, fetchTimeout = 90000) {
  for (const endpoint of endpoints) {
    const item = await requestKeith(endpoint, input);
    if (!item?.url) continue;
    try {
      const buffer = await downloadBuffer(item.url, fetchTimeout);
      return { ...item, buffer };
    } catch {}
  }
  return null;
}

function getTempDir(sub = 'davex') {
  const dir = path.join(os.tmpdir(), 'adevos-x-bot-' + sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================
// TIKTOK (Keith first + fallbacks)
// ============================
async function fetchTikTok(url) {
  const keith = await keithFirstMedia(KEITH_TIKTOK_ENDPOINTS, url);
  if (keith) return { video: keith.url, buffer: keith.buffer, title: keith.title || 'TikTok' };

  const apis = [
    {
      url: `https://api.drexapp.space/downloader/tiktok?url=${encodeURIComponent(url)}`,
      parse: d => {
        const r = d?.result?.result || d?.result;
        return { video: r?.play || r?.wmplay || r?.video, title: r?.title || 'TikTok' };
      },
      check: d => d?.status && d?.result
    },
    {
      url: `https://api.giftedtech.co.ke/api/download/tiktok?apikey=gifted&url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.no_watermark || d?.result?.video || d?.result?.url, title: d?.result?.title || 'TikTok' }),
      check: d => d?.success && d?.result
    },
    {
      url: `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.data?.no_watermark || d?.data?.video || d?.data?.url, title: d?.data?.title || 'TikTok' }),
      check: d => d?.data
    }
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000, headers: AXIOS_OPTS.headers });
      if (!api.check(res.data)) continue;
      const parsed = api.parse(res.data);
      if (!/^https?:\/\//i.test(parsed.video || '')) continue;
      const buffer = await downloadBuffer(parsed.video);
      return { ...parsed, buffer };
    } catch {}
  }
  return null;
}

// ============================
// FACEBOOK (Keith first + fallbacks)
// ============================
async function fetchFacebook(url) {
  const keith = await keithFirstMedia(KEITH_FACEBOOK_ENDPOINTS, url);
  if (keith) return { video: keith.url, buffer: keith.buffer, title: keith.title || 'Facebook' };

  const apis = [
    {
      url: `https://api.drexapp.space/downloader/facebookv2?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.download_url || d?.result?.url, title: d?.result?.title || 'Facebook' }),
      check: d => d?.status && d?.result?.download_url
    },
    {
      url: `https://api.giftedtech.co.ke/api/download/facebook?apikey=gifted&url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.hd || d?.result?.sd || d?.result?.url, title: d?.result?.title || 'Facebook' }),
      check: d => d?.success && d?.result
    }
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000, headers: AXIOS_OPTS.headers });
      if (!api.check(res.data)) continue;
      const parsed = api.parse(res.data);
      if (!/^https?:\/\//i.test(parsed.video || '')) continue;
      const buffer = await downloadBuffer(parsed.video);
      return { ...parsed, buffer };
    } catch {}
  }
  return null;
}

// ============================
// INSTAGRAM (Keith first + fallbacks)
// ============================
async function fetchInstagram(url) {
  const keith = await keithFirstMedia(KEITH_INSTAGRAM_ENDPOINTS, url);
  if (keith) {
    const isImage = /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(keith.url);
    return { video: isImage ? null : keith.url, image: isImage ? keith.url : null, buffer: keith.buffer, title: 'Instagram' };
  }

  const apis = [
    {
      url: `https://api.drexapp.space/downloader/instagram?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.media_url, image: d?.result?.media_url, title: 'Instagram' }),
      check: d => d?.status && d?.result?.media_url
    },
    {
      url: `https://api.giftedtech.co.ke/api/download/instagram?apikey=gifted&url=${encodeURIComponent(url)}`,
      parse: d => {
        const items = Array.isArray(d?.result) ? d.result : [d?.result];
        const item = items[0] || {};
        return { video: item?.video || item?.url, image: item?.image || item?.thumbnail, title: 'Instagram' };
      },
      check: d => d?.success && d?.result
    }
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000, headers: AXIOS_OPTS.headers });
      if (!api.check(res.data)) continue;
      const parsed = api.parse(res.data);
      const mediaUrl = parsed.video || parsed.image;
      if (!/^https?:\/\//i.test(mediaUrl || '')) continue;
      const buffer = await downloadBuffer(mediaUrl);
      return { ...parsed, buffer };
    } catch {}
  }
  return null;
}

// ============================
// YOUTUBE AUDIO (Keith first + fallbacks)
// ============================
async function resolveYoutubeVideo(query) {
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(query)) return { url: query, title: 'Audio' };
  try {
    const res = await axios.get(`${KEITH_BASE}/search/yts`, { params: { query }, timeout: 10000, headers: AXIOS_OPTS.headers });
    const data = res.data || {};
    const items = Array.isArray(data.result) ? data.result : (Array.isArray(data.data) ? data.data : []);
    const item = items.find(v => v && /^https?:\/\//i.test(v.url || v.videoUrl || v.link));
    if (item) return { url: item.url || item.videoUrl || item.link, title: item.title || item.name || 'Audio' };
  } catch {}
  try {
    const yts = require('yt-search');
    let search = await yts(`${query} official audio`);
    let video = search.videos?.[0];
    if (!video) {
      search = await yts(query);
      video = search.videos?.[0];
    }
    return video || null;
  } catch {
    return null;
  }
}

async function fetchYtAudioByQuery(query) {
  const video = await resolveYoutubeVideo(query);
  if (!video?.url) return null;

  const keith = await keithFirstMedia(KEITH_AUDIO_ENDPOINTS, video.url);
  if (keith) return { download: keith.url, buffer: keith.buffer, title: keith.title || video.title };

  const fallbackApis = [
    { url: `https://api.drexapp.space/downloader/yta?q=${encodeURIComponent(video.url)}`, parse: d => d?.result?.dl_url },
    { url: `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`, parse: d => d?.result?.download_url || d?.result?.url || d?.download_url || d?.url },
    { url: `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(video.url)}`, parse: d => d?.result?.download_url || d?.result?.url || d?.download_url || d?.url }
  ];
  for (const api of fallbackApis) {
    try {
      const res = await axios.get(api.url, { ...AXIOS_OPTS, timeout: 20000 });
      const download = api.parse(res.data);
      if (!/^https?:\/\//i.test(download || '')) continue;
      const buffer = await downloadBuffer(download);
      return { download, buffer, title: res.data?.result?.title || video.title };
    } catch {}
  }
  return null;
}

// ============================
// YOUTUBE VIDEO (Keith first + fallbacks)
// ============================
async function fetchYtVideo(youtubeUrl) {
  const keith = await keithFirstMedia(KEITH_VIDEO_ENDPOINTS, youtubeUrl, 120000);
  if (keith) return { download: keith.url, buffer: keith.buffer, title: keith.title || 'Video' };

  const enc = encodeURIComponent(youtubeUrl);
  const apis = [
    { url: `https://api.siputzx.my.id/api/d/ytmp4?url=${enc}` },
    { url: `https://api.giftedtech.co.ke/api/download/ytv?apikey=gifted&url=${enc}` }
  ];
  for (const api of apis) {
    try {
      const res = await tryRequest(() => axios.get(api.url, { ...AXIOS_OPTS, timeout: 30000 }));
      const download = extractMediaUrl(res.data);
      if (!download) continue;
      const buffer = await downloadBuffer(download, 120000);
      return { download, buffer, title: res.data?.result?.title || res.data?.data?.title || 'Video' };
    } catch {}
  }
  return null;
}

// ============================
// TWITTER (Keith first + fallbacks)
// ============================
async function fetchTwitter(url) {
  const keith = await keithFirstMedia(KEITH_TWITTER_ENDPOINTS, url);
  if (keith) return { video: keith.url, buffer: keith.buffer, desc: '' };

  const apis = [
    async () => {
      const res = await axios.get(`https://api.giftedtech.co.ke/api/download/twitter?apikey=gifted&url=${encodeURIComponent(url)}`, { timeout: 20000, headers: AXIOS_OPTS.headers });
      const r = res.data?.result;
      return { video: r?.hd || r?.sd || r?.url, desc: r?.desc || '' };
    },
    async () => {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(url)}`, { timeout: 20000, headers: AXIOS_OPTS.headers });
      const r = res.data?.data;
      const v = Array.isArray(r) ? (r[0]?.url || null) : (r?.hd || r?.sd || r?.url);
      return { video: v, desc: '' };
    }
  ];
  for (const fn of apis) {
    try {
      const r = await fn();
      if (!/^https?:\/\//i.test(r?.video || '')) continue;
      const buffer = await downloadBuffer(r.video);
      return { ...r, buffer };
    } catch {}
  }
  return null;
}



module.exports = [
{
    name: 'ytmp4',
    aliases: ['ytvideo', 'yt'],
    category: 'download',
    description: 'Download YouTube video',
    usage: '.ytmp4 <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      const url = args.join(' ').trim();

      if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        return sock.sendMessage(chatId, { text: buildHint('Provide a YouTube link', '.ytmp4 <url>') }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const result = await fetchYtVideo(url);
        if (!result?.download) throw new Error('Video download failed');

        const cleanTitle = (result.title || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
        await sock.sendMessage(chatId, {
          document: result.buffer || { url: result.download },
          mimetype: 'video/mp4',
          fileName: `${cleanTitle}.mp4`,
          caption: `*${botName}*\n${cleanTitle}`,
          ...replyOpts()
        }, { quoted: fake });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (error) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: buildHint(`Failed: ${error.message}`) }, { quoted: fake });
      }
    }
  }
];
