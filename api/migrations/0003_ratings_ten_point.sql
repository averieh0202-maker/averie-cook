-- Store and accept visitor ratings on a 1–10 scale.
-- Existing 1–5 scores are doubled so historical data stays comparable.
CREATE TABLE ratings_v2 (
  dish_id TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dish_id, visitor_key)
);

INSERT INTO ratings_v2 (dish_id, visitor_key, score, updated_at)
SELECT
  dish_id,
  visitor_key,
  CASE
    WHEN score BETWEEN 1 AND 5 THEN score * 2
    WHEN score BETWEEN 6 AND 10 THEN score
    ELSE 10
  END,
  updated_at
FROM ratings;

DROP TABLE ratings;
ALTER TABLE ratings_v2 RENAME TO ratings;
