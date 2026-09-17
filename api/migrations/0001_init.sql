CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('cooked', 'want_cook')),
  categories TEXT NOT NULL DEFAULT '[]',
  cover_path TEXT,
  cooked_at TEXT,
  source_url TEXT,
  source_type TEXT,
  recipe TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dishes_status ON dishes(status);
CREATE INDEX IF NOT EXISTS idx_dishes_published ON dishes(published, deleted_at);

CREATE TABLE IF NOT EXISTS ratings (
  dish_id TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dish_id, visitor_key),
  FOREIGN KEY (dish_id) REFERENCES dishes(id)
);

CREATE TABLE IF NOT EXISTS want_eat (
  dish_id TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (dish_id, visitor_key),
  FOREIGN KEY (dish_id) REFERENCES dishes(id)
);

CREATE INDEX IF NOT EXISTS idx_want_eat_created ON want_eat(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
