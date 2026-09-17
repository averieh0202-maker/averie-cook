CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  body BLOB NOT NULL,
  created_at TEXT NOT NULL
);
