// Prize payout per 1,000 stake. Mirrors the front-end config so the SERVER
// is the single source of truth for money calculations.
export const PAYOUT = {
  B:  { '1': 3000000, '2': 900000, '3': 400000, '10': 180000, '20': 50000 },
  S:  { '1': 4500000, '2': 1500000, '3': 900000 },
  '4A': { '1': 6500000 },
  '4B': { '1': 6500000 },
  '4C': { '1': 400000 },
  '4E': { '1': 400000 },
  '5': { '1': 11000000, '2': 3500000, '3': 2500000, '4': 350000, '5': 10000 },
  '6': { '1': 70000000, '2': 2500000, '3': 200000, '4': 15000, '5': 2000 },
};

export const COLS = ['B', 'S', '4A', '4B', '4C', '4E'];

// 4D payout for one bet at a given prize rank.
export function payout4d(bet, rank) {
  const rk = String(rank);
  let total = 0;
  const cols = bet.cols || {};
  for (const c of COLS) {
    const stk = Number(cols[c] || 0);
    if (stk > 0 && PAYOUT[c] && PAYOUT[c][rk]) total += (stk / 1000) * PAYOUT[c][rk];
  }
  return total;
}

// 5D/6D payout for a flat stake amount at a given rank.
export function payoutND(mode, amount, rank) {
  const t = PAYOUT[String(mode)];
  const rk = String(rank);
  if (!t || !t[rk]) return 0;
  return (Number(amount || 0) / 1000) * t[rk];
}
