import crypto from 'node:crypto';
import { config } from './config.js';

// ---- Verify Telegram Mini App initData ----
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// The client sends window.Telegram.WebApp.initData (a query string). We recompute
// the HMAC and compare, so we can trust the user id WITHOUT any password.
export function verifyInitData(initData, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== 'string') return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.botToken)
    .digest();

  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // constant-time compare
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // freshness check to prevent replay of old initData
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw); // { id, username, first_name, last_name, ... }
  } catch {
    return null;
  }
}

// ---- Minimal Telegram Bot API helpers (no external deps) ----
const API = `https://api.telegram.org/bot${config.botToken}`;

export async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function setWebhook(url) {
  return tg('setWebhook', { url, allowed_updates: ['message'] });
}

export async function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}
