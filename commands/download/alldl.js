'use strict';

const handlers = {
  tiktok: require('./tiktok').find(command => command.name === 'tiktok'),
  instagram: require('./instagram').find(command => command.name === 'instagram'),
  facebook: require('./facebook').find(command => command.name === 'facebook'),
  twitter: require('./twitter').find(command => command.name === 'twitter'),
  pinterest: require('./pinterest').find(command => command.name === 'pinterest'),
  spotify: require('./spotify').find(command => command.name === 'spotify'),
  mediafire: require('./mediafire').find(command => command.name === 'mediafire'),
  youtube: require('./ytmp4').find(command => command.name === 'ytmp4'),
};

function route(url, audio = false) {
  const value = url.toLowerCase();
  if (/tiktok\.com|vm\.tiktok\.com/.test(value)) return 'tiktok';
  if (/instagram\.com/.test(value)) return 'instagram';
  if (/facebook\.com|fb\.watch/.test(value)) return 'facebook';
  if (/twitter\.com|x\.com/.test(value)) return 'twitter';
  if (/pinterest\./.test(value)) return 'pinterest';
  if (/spotify\.com/.test(value)) return 'spotify';
  if (/mediafire\.com/.test(value)) return 'mediafire';
  if (/youtube\.com|youtu\.be/.test(value)) return audio ? 'ytmp3' : 'youtube';
  return '';
}

module.exports = {
  name: 'alldl',
  aliases: ['anylink', 'universaldl', 'download'],
  category: 'download',
  description: 'Download media from a supported URL',
  usage: '.alldl [audio] <url>',
  execute: async (sock, message, args, context) => {
    const audio = String(args[0] || '').toLowerCase() === 'audio';
    const url = args[audio ? 1 : 0] || '';
    if (!/^https?:\/\//i.test(url)) return context.reply('Usage: .alldl [audio] <supported URL>');
    const key = route(url, audio);
    if (audio && key === 'ytmp3' && !handlers.ytmp3) {
      handlers.ytmp3 = require('./ytmp3').find(command => command.name === 'ytmp3');
    }
    const handler = key === 'ytmp3' ? handlers.ytmp3 : handlers[key];
    if (!handler?.execute) return context.reply('That URL is not supported. Use a specific downloader command instead.');
    return handler.execute(sock, message, [url], context);
  },
};
