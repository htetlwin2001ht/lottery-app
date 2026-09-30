import { Router } from 'express';
import { query } from '../db.js';

export const reportsRouter = Router();

// GET /api/reports/summary?date=YYYY-MM-DD
// Normal user: own totals. Admin: global totals + per-house/per-game breakdown.
reportsRouter.get('/summary', async (req, res) => {
  const { date } = req.query;
  const params = [];
  const clauses = [];
  if (!req.user.isAdmin) { params.push(req.user.id.toString()); clauses.push(`user_id = $${params.length}`); }
  if (date) { params.push(date); clauses.push(`draw_date = $${params.length}`); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const totals = (await query(
    `SELECT COUNT(*)::int AS bets, COALESCE(SUM(amount),0)::bigint AS total_staked FROM bets ${where}`,
    params
  )).rows[0];

  const byHouse = (await query(
    `SELECT house, COUNT(*)::int AS bets, COALESCE(SUM(amount),0)::bigint AS staked
     FROM bets ${where} GROUP BY house ORDER BY staked DESC`, params
  )).rows;

  const byGame = (await query(
    `SELECT mode, COUNT(*)::int AS bets, COALESCE(SUM(amount),0)::bigint AS staked
     FROM bets ${where} GROUP BY mode ORDER BY mode`, params
  )).rows;

  res.json({ scope: req.user.isAdmin ? 'global' : 'self', totals, byHouse, byGame });
});
