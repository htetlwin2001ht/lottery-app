# Lottery Betting Manager — Telegram Mini App (Node.js backend)

4D / 5D / 6D lottery betting manager built to run as a **Telegram Mini App**
backed by **Node.js + Express + PostgreSQL**. Designed to scale to 100k+ users
(stateless API + connection pooling + indexed queries; scale horizontally by
running more instances behind a load balancer).

## What's included

```
lottery_backend/
├─ package.json          # deps + scripts
├─ .env.example          # copy to .env and fill in
├─ db/schema.sql         # PostgreSQL tables + indexes
├─ src/
│  ├─ config.js          # env loading
│  ├─ db.js              # pg pool + tx helper
│  ├─ migrate.js         # applies schema.sql
│  ├─ telegram.js        # initData verification + Bot API helpers
│  ├─ auth.js            # auth middleware (Telegram login) + admin guard
│  ├─ payout.js          # prize payout tables (server is source of truth)
│  ├─ server.js          # express app + webhook + static Mini App
│  └─ routes/            # bets, draws, reports
└─ public/               # Mini App front-end (index.html, app.js, style.css)
```

## How authentication works (no passwords)

The Mini App runs inside Telegram, which provides a signed `initData` string.
The front-end sends it in the `X-Telegram-Init-Data` header; the server verifies
the HMAC signature with your bot token (see `src/telegram.js`). This proves the
Telegram user id without any username/password. Admins are listed in `ADMIN_IDS`.

## Setup (local)

1. Install Node.js 18+ and PostgreSQL.
2. `npm install`
3. `cp .env.example .env` and fill in:
   - `BOT_TOKEN` from @BotFather
   - `DATABASE_URL` for your Postgres
   - `ADMIN_IDS` (your Telegram numeric id from @userinfobot)
   - `PUBLIC_URL` (your public https URL once deployed)
4. `npm run migrate`   # create tables
5. `npm start`

## Deploy (recommended: Railway or Render)

1. Create a Postgres database on the platform; copy its connection string into
   `DATABASE_URL`.
2. Deploy this repo as a Node service. Set the same env vars.
3. Make sure the service has a public HTTPS URL; set `PUBLIC_URL` to it.
4. On boot the server calls `setWebhook(PUBLIC_URL/webhook)` automatically.
5. In @BotFather: set the Mini App / menu button URL to your `PUBLIC_URL` too
   (optional — `/start` already sends an "Open App" button).

## Telegram bot setup

1. Talk to @BotFather -> `/newbot` -> get the token -> put in `BOT_TOKEN`.
2. (Optional) `/setmenubutton` -> point to your `PUBLIC_URL` so the app opens
   from the chat menu.
3. Send `/start` to your bot; tap **Open App**.

## Scaling notes (100k+ users)

- API is stateless → run N instances behind a load balancer; sessions come from
  Telegram initData, so no sticky sessions needed.
- PostgreSQL: start on a managed plan; the schema indexes the hot paths
  (`user_id`, `draw_date/house/mode`). Add read replicas if reporting gets heavy.
- Rate limiting is enabled per-instance (`express-rate-limit`); for a global
  limit put a limiter at the load balancer / use Redis-backed limiting.
- Consider moving heavy "check all winners" jobs to a background worker if a
  single draw has millions of bets.

## Legal / compliance

Real-money lottery/gambling is regulated. Check your jurisdiction's licensing
requirements and Telegram's terms before going live.
