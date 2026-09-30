import express from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { authMiddleware } from './auth.js';
import { betsRouter } from './routes/bets.js';
import { drawsRouter } from './routes/draws.js';
import { reportsRouter } from './routes/reports.js';
import { setWebhook, sendMessage } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

// Basic rate limiting to protect the API at scale.
const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

// ---- Health check (for the hosting platform) ----
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- Telegram webhook ----
// @BotFather bot sends updates here. We reply with a button that opens the Mini App.
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ack immediately
  try {
    const msg = req.body?.message;
    if (!msg || !msg.text) return;
    const chatId = msg.chat.id;
    if (msg.text.startsWith('/start')) {
      const url = `${config.publicUrl}/`;
      await sendMessage(chatId, 'Welcome to <b>Lottery Betting Manager</b>. Tap below to open the app.', {
        reply_markup: { inline_keyboard: [[{ text: '\u{1F3B0} Open App', web_app: { url } }]] },
      });
    }
  } catch (e) {
    console.error('[webhook] error', e);
  }
});

// ---- API (all routes require a valid Telegram Mini App session) ----
app.use('/api', apiLimiter, authMiddleware);
app.use('/api/bets', betsRouter);
app.use('/api/draws', drawsRouter);
app.use('/api/reports', reportsRouter);

// ---- Serve the Mini App front-end ----
app.use(express.static(join(__dirname, '..', 'public')));

app.listen(config.port, async () => {
  console.log(`[server] listening on :${config.port}`);
  if (config.publicUrl) {
    try {
      const r = await setWebhook(`${config.publicUrl}/webhook`);
      console.log('[server] setWebhook:', r.ok ? 'ok' : JSON.stringify(r));
    } catch (e) {
      console.error('[server] setWebhook failed', e);
    }
  } else {
    console.warn('[server] PUBLIC_URL not set - webhook not registered.');
  }
});
