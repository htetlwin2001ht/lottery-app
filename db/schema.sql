-- 4D / 5D / 6D lottery betting manager schema (PostgreSQL)
-- Designed to handle 100k+ users. Uses indexes on the hot lookup paths.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT PRIMARY KEY,               -- Telegram user id
  username      TEXT,
  first_name    TEXT,
  last_name     TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per placed bet.
CREATE TABLE IF NOT EXISTS bets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        SMALLINT NOT NULL CHECK (mode IN (4,5,6)),   -- 4D / 5D / 6D
  number      TEXT NOT NULL,                                -- the digits, e.g. '1234'
  bet_type    TEXT NOT NULL DEFAULT 'STRAIGHT',
  house       TEXT NOT NULL,
  cols        JSONB NOT NULL DEFAULT '{}'::jsonb,           -- 4D per-column stakes {B,S,4A,...}
  amount      BIGINT NOT NULL CHECK (amount > 0),           -- total stake
  customer    TEXT,
  draw_date   DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bets_user        ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_draw        ON bets(draw_date, house, mode);
CREATE INDEX IF NOT EXISTS idx_bets_user_date   ON bets(user_id, draw_date);
CREATE INDEX IF NOT EXISTS idx_bets_number      ON bets(mode, house, number);

-- Winning numbers per house / date / draw. Prizes stored as JSONB for flexibility.
CREATE TABLE IF NOT EXISTS draws (
  id          BIGSERIAL PRIMARY KEY,
  mode        SMALLINT NOT NULL CHECK (mode IN (4,5,6)),
  house       TEXT NOT NULL,
  draw_date   DATE NOT NULL,
  draw_no     TEXT,
  prizes      JSONB NOT NULL,       -- {top:{1,2,3}, starters:[], consos:[]} or {p:{1..6}} etc.
  entered_by  BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mode, house, draw_date)
);

CREATE INDEX IF NOT EXISTS idx_draws_lookup ON draws(draw_date, house, mode);

-- Optional per-user settings (max stake, cut-off).
CREATE TABLE IF NOT EXISTS settings (
  user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_stake   BIGINT NOT NULL DEFAULT 0,
  cutoff      TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
