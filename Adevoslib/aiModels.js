'use strict';

const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];
const DEFAULT_VISION_MODELS = [
  'llama-3.2-11b-vision-preview',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-90b-vision-preview',
];

function readKeys() {
  const grouped = String(process.env.GROQ_API_KEYS || '')
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(Boolean);
  const numbered = Object.keys(process.env)
    .filter(key => /^GROQ_KEY_\d+$/i.test(key))
    .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()))
    .map(key => String(process.env[key] || '').trim())
    .filter(Boolean);
  return [...new Set([...grouped, process.env.GROQ_API_KEY, ...numbered].filter(Boolean))];
}

function normalizeModels(value, defaults) {
  const requested = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/).filter(Boolean);
  return [...new Set([...requested, ...defaults].filter(Boolean))];
}

function modelFromHint(hint, defaults) {
  const value = String(hint || '').toLowerCase();
  if (!value) return defaults;
  if (value === 'fast' || value === 'small' || value === '8b') return ['llama-3.1-8b-instant', ...defaults];
  if (value === '70b' || value === 'quality' || value === 'large') return ['llama-3.3-70b-versatile', ...defaults];
  return [String(hint), ...defaults];
}

function keyCursor() {
  let index = 0;
  return keys => {
    if (!keys.length) return '';
    const key = keys[index % keys.length];
    index += 1;
    return key;
  };
}

async function requestModel(model, messages, options, key) {
  const payload = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1024,
  };
  const response = await axios.post(GROQ_URL, payload, {
    timeout: options.timeoutMs ?? 30000,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(`Groq ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const text = response.data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('Empty model response');
  return text.trim();
}

async function complete(messages, options = {}) {
  const keys = readKeys();
  if (!keys.length) return null;
  const defaults = options.vision ? DEFAULT_VISION_MODELS : DEFAULT_TEXT_MODELS;
  const models = normalizeModels(modelFromHint(options.model, defaults), defaults);
  const nextKey = keyCursor();
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      const key = nextKey(keys);
      try {
        const text = await requestModel(model, messages, options, key);
        return { text, model };
      } catch (error) {
        lastError = error;
        if (![401, 403, 404, 408, 413, 429, 500, 502, 503, 504].includes(error.status)) break;
      }
    }
  }
  if (options.throwOnFailure) throw lastError || new Error('All AI models failed');
  return null;
}

async function generateText(prompt, options = {}) {
  const system = options.system || 'You are a helpful, accurate, and concise WhatsApp assistant.';
  return complete([
    { role: 'system', content: system },
    { role: 'user', content: String(prompt || '') },
  ], options);
}

async function downloadMediaBuffer(media, mediaType, sock) {
  const stream = await downloadContentFromMessage(media, mediaType);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function unwrap(message) {
  let current = message;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    else break;
  }
  return current || {};
}

async function getQuotedImage(message, sock) {
  const root = unwrap(message?.message || {});
  const contextInfo = root.extendedTextMessage?.contextInfo || root.imageMessage?.contextInfo || {};
  const quoted = unwrap(contextInfo.quotedMessage || {});
  const image = quoted.imageMessage || root.imageMessage;
  if (!image) return null;
  const mime = image.mimetype || 'image/jpeg';
  const buffer = await downloadMediaBuffer(image, 'image', sock);
  if (!buffer.length) return null;
  return { buffer, mime };
}

async function generateVision(buffer, mime, prompt, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer.length > (options.maxImageBytes || 8 * 1024 * 1024)) throw new Error('Image is too large');
  const dataUrl = `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  return complete([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: prompt || 'Describe this image in detail, accurately and concisely.' },
    ],
  }], { ...options, vision: true });
}

function readGeminiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

async function geminiRequest(parts, options = {}) {
  const key = readGeminiKey();
  if (!key) return null;
  const models = normalizeModels(options.model || process.env.GEMINI_MODEL, ['gemini-2.0-flash', 'gemini-1.5-flash']);
  let lastError;
  for (const model of models) {
    try {
      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1024,
        },
      }, {
        params: { key },
        timeout: options.timeoutMs ?? 30000,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        const error = new Error(`Gemini ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const text = response.data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (text) return { text, model, provider: 'gemini' };
      lastError = new Error('Empty Gemini response');
    } catch (error) {
      lastError = error;
      if (![400, 401, 403, 404, 408, 429, 500, 502, 503, 504].includes(error.status)) break;
    }
  }
  if (options.throwOnFailure) throw lastError || new Error('All Gemini models failed');
  return null;
}

async function generateGemini(prompt, options = {}) {
  return geminiRequest([{ text: String(prompt || '') }], options);
}

async function generateGeminiVision(buffer, mime, prompt, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer.length > (options.maxImageBytes || 8 * 1024 * 1024)) throw new Error('Image is too large');
  return geminiRequest([
    { inline_data: { mime_type: mime || 'image/jpeg', data: buffer.toString('base64') } },
    { text: prompt || 'Describe this image in detail, accurately and concisely.' },
  ], options);
}

module.exports = {
  DEFAULT_TEXT_MODELS,
  DEFAULT_VISION_MODELS,
  readKeys,
  complete,
  generateText,
  generateVision,
  generateGemini,
  generateGeminiVision,
  getQuotedImage,
  modelFromHint,
};
