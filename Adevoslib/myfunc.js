const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const unixTimestampSeconds = (date = new Date()) => Math.floor(date.getTime() / 1000);

function getChatId(message) {
  return message?.key?.remoteJid || null;
}

function getSenderId(message, sock = null) {
  if (!message?.key) return null;
  if (message.key.fromMe && sock?.user?.id) {
    return sock.user.id.split(':')[0] + '@s.whatsapp.net';
  }
  return message.key.participant || message.key.remoteJid || null;
}

function generateMessageTag() {
  return Math.random().toString(36).substr(2, 9);
}

async function getBuffer(url, options = {}) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
      ...options
    });
    return Buffer.from(response.data);
  } catch (error) {
    throw new Error(`Failed to get buffer from ${url}: ${error.message}`);
  }
}

function getSizeMedia(sizeInBytes) {
  const kb = sizeInBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

async function fetchJson(url, options = {}) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers
      },
      ...options
    });
    return response.data;
  } catch (error) {
    throw new Error(`fetchJson failed for ${url}: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reSize(buffer, width, height) {
  try {
    const Jimp = require('jimp');
    const image = await Jimp.read(buffer);
    image.resize(width, height);
    return await image.getBufferAsync(Jimp.MIME_JPEG);
  } catch (error) {
    return buffer;
  }
}

function isUrl(text) {
  try {
    const urlPattern = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
    return urlPattern.test(text);
  } catch (e) {
    return false;
  }
}

function getCurrentTime(format = 'time') {
  const { getSetting } = require('../AdevosAuth/database');
  const tz = getSetting('timezone', 'Africa/Nairobi');
  const now = moment().tz(tz);
  if (format === 'time2') return now.format('HH:mm:ss DD/MM/YYYY');
  if (format === 'date') return now.format('DD/MM/YYYY');
  if (format === 'full') return now.format('dddd, MMMM Do YYYY, HH:mm:ss');
  return now.format('HH:mm:ss');
}

function getCurrentTimezone() {
  const { getSetting } = require('../AdevosAuth/database');
  return getSetting('timezone', 'Africa/Nairobi');
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

module.exports = {
  unixTimestampSeconds,
  getChatId,
  getSenderId,
  generateMessageTag,
  getBuffer,
  getSizeMedia,
  fetchJson,
  sleep,
  reSize,
  isUrl,
  getCurrentTime,
  getCurrentTimezone,
  formatDuration,
};
