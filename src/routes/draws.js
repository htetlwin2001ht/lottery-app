import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../auth.js';
import { payout4d, payoutND } from '../payout.js';

export const drawsRouter = Router();

// POST /api/draws  (admin only) -> enter/overwrite winning numbers for a draw
// body: { mode, house, draw_date, draw_no, prizes }
drawsRouter.post('/', requireAdmin, async (req, res) => {
  const { mode, house, draw_date, draw_no, prizes } = req.body || {};
  if (![4, 5, 6].includes(Number(mode))) return res.status(400).json({ error: 'bad_mode' });
  if (!house || !draw_date || !prizes) return res.status(400).json({ error: 'missing_fields' });

  await query(
    `INSERT INTO draws (mode, house, draw_date, draw_no, prizes, entered_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (mode, house, draw_date) DO UPDATE
       SET draw_no = EXCLUDED.draw_no, prizes = EXCLUDED.prizes,
           entered_by = EXCLUDED.entered_by, created_at = now()`,
    [Number(mode), house, draw_date, draw_no || null, JSON.stringify(prizes), req.user.id.toString()]
  );
  res.json({ ok: true });
});

// GET /api/draws?date=&house=&mode=
drawsRouter.get('/', async (req, res) => {
  const { date, house, mode } = req.query;
  const clauses = [];
  const params = [];
  if (date) { params.push(date); clauses.push(`draw_date = $${params.length}`); }
  if (house) { params.push(house); clauses.push(`house = $${params.length}`); }
  if (mode) { params.push(Number(mode)); clauses.push(`mode = $${params.length}`); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const { rows } = await query(`SELECT * FROM draws ${where} ORDER BY draw_date DESC LIMIT 200`, params);
  res.json({ draws: rows });
});

// POST /api/draws/check -> evaluate winners for a given draw against bets.
// body: { mode, house, draw_date }. Admin sees all bets; a normal user sees own.
drawsRouter.post('/check', async (req, res) => {
  const mode = Number(req.body?.mode);
  const { house, draw_date } = req.body || {};
  if (![4, 5, 6].includes(mode) || !house || !draw_date) return res.status(400).json({ error: 'bad_input' });

  const dr = await query(
    'SELECT * FROM draws WHERE mode=$1 AND house=$2 AND draw_date=$3',
    [mode, house, draw_date]
  );
  if (!dr.rows.length) return res.status(404).json({ error: 'no_draw' });
  const prizes = dr.rows[0].prizes;

  const params = [mode, house, draw_date];
  let sql = 'SELECT * FROM bets WHERE mode=$1 AND house=$2 AND draw_date=$3';
  if (!req.user.isAdmin) { params.push(req.user.id.toString()); sql += ` AND user_id = $${params.length}`; }
  const bets = (await query(sql, params)).rows;

  const wins = [];
  if (mode === 4) {
    const top = prizes.top || {};
    const starters = prizes.starters || [];
    const consos = prizes.consos || [];
    const check = (bet) => {
      const n = bet.number;
      const rev = n.split('').reverse().join('');
      const hit = (pn) => pn && (n === pn ? 'Front' : rev === pn ? 'Back' : null);
      const tryRank = (pn, cat, rank) => {
        const pos = hit(pn);
        if (pos) wins.push({ bet_id: bet.id, user_id: bet.user_id, number: n, cat, rank, pos, amount: Number(bet.amount), win: payout4d(bet, rank), customer: bet.customer });
      };
      tryRank(top['1'], '1st', 1); tryRank(top['2'], '2nd', 2); tryRank(top['3'], '3rd', 3);
      starters.forEach((pn) => tryRank(pn, 'Starter', 10));
      consos.forEach((pn) => tryRank(pn, 'Consolation', 20));
    };
    bets.forEach(check);
  } else if (mode === 5) {
    const p = prizes.p || {};
    const defs = [
      { r: 1, cat: '1st', fn: (n) => n === p['1'] },
      { r: 2, cat: '2nd', fn: (n) => n === p['2'] },
      { r: 3, cat: '3rd', fn: (n) => n === p['3'] },
      { r: 4, cat: '4th', fn: (n) => p['4'] && n.slice(-4) === p['4'] },
      { r: 5, cat: '5th', fn: (n) => p['5'] && n.slice(-3) === p['5'] },
      { r: 6, cat: '6th', fn: (n) => p['6'] && n.slice(-2) === p['6'] },
    ];
    bets.forEach((b) => defs.forEach((d) => {
      if (d.fn(b.number)) wins.push({ bet_id: b.id, user_id: b.user_id, number: b.number, cat: d.cat, rank: d.r, amount: Number(b.amount), win: payoutND(5, b.amount, d.r), customer: b.customer });
    }));
  } else {
    const p1 = (prizes.p && prizes.p['1']) || prizes.first;
    const f = (n, k) => n.slice(0, k), l = (n, k) => n.slice(-k);
    const defs = [
      { rank: 1, cat: '1st', fn: (n) => n === p1 },
      { rank: 2, cat: '2nd', fn: (n) => f(n,5)===f(p1,5) || l(n,5)===l(p1,5) },
      { rank: 3, cat: '3rd', fn: (n) => f(n,4)===f(p1,4) || l(n,4)===l(p1,4) },
      { rank: 4, cat: '4th', fn: (n) => f(n,3)===f(p1,3) || l(n,3)===l(p1,3) },
      { rank: 5, cat: '5th', fn: (n) => f(n,2)===f(p1,2) || l(n,2)===l(p1,2) },
    ];
    bets.forEach((b) => {
      for (const d of defs) { if (d.fn(b.number)) { wins.push({ bet_id: b.id, user_id: b.user_id, number: b.number, cat: d.cat, rank: d.rank, amount: Number(b.amount), win: payoutND(6, b.amount, d.rank), customer: b.customer }); break; } }
    });
  }

  const totalStaked = bets.reduce((s, b) => s + Number(b.amount || 0), 0);
  const totalPayout = wins.reduce((s, w) => s + Number(w.win || 0), 0);
  res.json({ prizes, wins, totals: { bets: bets.length, totalStaked, totalPayout } });
});
