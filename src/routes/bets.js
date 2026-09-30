import { Router } from 'express';
import { query } from '../db.js';

export const betsRouter = Router();

const MIN = 1000;
const HOUSES_4D = ['Magnum', 'Toto', 'Damacai', 'Dragon', '9Lotto', 'Singapore'];
const HOUSES_ND = ['Toto', 'Dragon', '9Lotto'];

function validNumber(mode, number) {
  return new RegExp(`^[0-9]{${mode}}$`).test(number);
}

// GET /api/bets?date=YYYY-MM-DD  -> current user's bets (optionally by date)
betsRouter.get('/', async (req, res) => {
  const { date } = req.query;
  const params = [req.user.id.toString()];
  let sql = 'SELECT * FROM bets WHERE user_id = $1';
  if (date) {
    params.push(date);
    sql += ' AND draw_date = $2';
  }
  sql += ' ORDER BY created_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  res.json({ bets: rows });
});

// POST /api/bets  -> add one or many bets in a single transaction
// body: { bets: [ { mode, number, bet_type, house, cols, amount, customer, draw_date } ] }
betsRouter.post('/', async (req, res) => {
  const list = Array.isArray(req.body?.bets) ? req.body.bets : [];
  if (!list.length) return res.status(400).json({ error: 'no_bets' });
  if (list.length > 200) return res.status(400).json({ error: 'too_many' });

  const rows = [];
  for (const b of list) {
    const mode = Number(b.mode);
    if (![4, 5, 6].includes(mode)) return res.status(400).json({ error: 'bad_mode' });
    if (!validNumber(mode, String(b.number || ''))) return res.status(400).json({ error: 'bad_number' });
    const houses = mode === 4 ? HOUSES_4D : HOUSES_ND;
    if (!houses.includes(b.house)) return res.status(400).json({ error: 'bad_house' });
    const amount = Number(b.amount || 0);
    if (!Number.isFinite(amount) || amount < MIN) return res.status(400).json({ error: 'below_min' });
    rows.push({
      mode,
      number: String(b.number),
      bet_type: b.bet_type || 'STRAIGHT',
      house: b.house,
      cols: b.cols && typeof b.cols === 'object' ? b.cols : {},
      amount: Math.round(amount),
      customer: b.customer ? String(b.customer).slice(0, 120) : null,
      draw_date: b.draw_date,
    });
  }

  // Bulk insert with parameterized values.
  const values = [];
  const placeholders = rows.map((r, i) => {
    const o = i * 9;
    values.push(
      req.user.id.toString(), r.mode, r.number, r.bet_type, r.house,
      JSON.stringify(r.cols), r.amount, r.customer, r.draw_date
    );
    return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9})`;
  });

  const { rows: inserted } = await query(
    `INSERT INTO bets (user_id, mode, number, bet_type, house, cols, amount, customer, draw_date)
     VALUES ${placeholders.join(',')} RETURNING id`,
    values
  );
  res.json({ added: inserted.length, ids: inserted.map((r) => r.id) });
});

// DELETE /api/bets/:id  -> delete one of the current user's bets
betsRouter.delete('/:id', async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM bets WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id.toString()]
  );
  res.json({ deleted: rowCount });
});
