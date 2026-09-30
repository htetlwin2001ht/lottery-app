import { verifyInitData } from './telegram.js';
import { query } from './db.js';
import { config } from './config.js';

// Express middleware: authenticate the request using Telegram Mini App initData.
// The Mini App front-end sends it in the 'X-Telegram-Init-Data' header.
export async function authMiddleware(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data') || '';
  const tgUser = verifyInitData(initData);
  if (!tgUser || !tgUser.id) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const isAdmin = config.adminIds.some((id) => id === BigInt(tgUser.id));

  // Upsert the user record and refresh last_seen.
  await query(
    `INSERT INTO users (id, username, first_name, last_name, is_admin, last_seen_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           is_admin = EXCLUDED.is_admin,
           last_seen_at = now()`,
    [tgUser.id, tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null, isAdmin]
  );

  req.user = {
    id: BigInt(tgUser.id),
    username: tgUser.username,
    firstName: tgUser.first_name,
    isAdmin,
  };
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'admin_only' });
  }
  next();
}
