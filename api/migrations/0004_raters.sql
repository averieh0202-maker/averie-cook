-- Lightweight per-person rater accounts. PIN is stored hashed, never in API JSON.
-- visitor_key is the same identity used by ratings (one account → one score per dish).
CREATE TABLE IF NOT EXISTS raters (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  display_name_norm TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  visitor_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raters_visitor_key ON raters(visitor_key);
