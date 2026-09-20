-- A dish is a recipe; an entry is one occasion. Updating a recipe never removes an occasion.
ALTER TABLE dishes ADD COLUMN author_key TEXT;
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]', cover_path TEXT, notes TEXT NOT NULL DEFAULT '',
  author_key TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('home','out')),
  target_id TEXT NOT NULL, occurred_on TEXT NOT NULL, meal TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', cover_path TEXT, author_key TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_entries_date ON entries(kind, occurred_on DESC);
CREATE INDEX idx_entries_target ON entries(kind, target_id);
CREATE TABLE entry_ratings (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  visitor_key TEXT NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL, PRIMARY KEY(entry_id,visitor_key)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('dish','restaurant','entry')),
  target_id TEXT NOT NULL, visitor_key TEXT NOT NULL, author_name TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_comments_target ON comments(scope,target_id,created_at);
CREATE TABLE board_entries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('dish','restaurant')),
  target_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(kind,target_id)
);
CREATE TABLE board_wants (
  board_id TEXT NOT NULL REFERENCES board_entries(id) ON DELETE CASCADE,
  visitor_key TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(board_id,visitor_key)
);
CREATE TABLE board_comments (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES board_entries(id) ON DELETE CASCADE,
  visitor_key TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_board_comments ON board_comments(board_id,created_at);

-- Preserve existing dates and scores as the original occasion, without deleting legacy rows.
INSERT OR IGNORE INTO entries(id,kind,target_id,occurred_on,created_at,updated_at)
SELECT 'legacy-' || id,'home',id,cooked_at,created_at,updated_at FROM dishes
WHERE status='cooked' AND cooked_at IS NOT NULL AND deleted_at IS NULL;
INSERT OR IGNORE INTO entry_ratings(entry_id,visitor_key,score,updated_at)
SELECT 'legacy-' || r.dish_id,r.visitor_key,r.score,r.updated_at FROM ratings r
JOIN entries e ON e.id='legacy-' || r.dish_id;
INSERT OR IGNORE INTO board_entries(id,kind,target_id,created_at)
SELECT 'legacy-' || dish_id,'dish',dish_id,MIN(created_at) FROM want_eat GROUP BY dish_id;
INSERT OR IGNORE INTO board_wants(board_id,visitor_key,created_at)
SELECT 'legacy-' || dish_id,visitor_key,created_at FROM want_eat;
