CREATE TABLE schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  birthday TEXT,
  grade TEXT,
  school TEXT,
  class_name TEXT,
  head_teacher TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX children_nickname_uq ON children(nickname);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  child_id TEXT,
  child_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('homework', 'todo')),
  subject TEXT,
  due_date TEXT NOT NULL,
  start_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
  images TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX tasks_identity_uq ON tasks(child_name, title, due_date);
CREATE UNIQUE INDEX tasks_legacy_uq ON tasks(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX tasks_due_idx ON tasks(due_date);
CREATE INDEX tasks_child_idx ON tasks(child_name);

CREATE TABLE behaviors (
  id TEXT PRIMARY KEY,
  child_id TEXT,
  child_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  dimension TEXT,
  tone TEXT,
  source TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX behaviors_identity_uq ON behaviors(child_name, occurred_on, title);
CREATE UNIQUE INDEX behaviors_legacy_uq ON behaviors(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX behaviors_date_idx ON behaviors(occurred_on);
CREATE INDEX behaviors_child_idx ON behaviors(child_name);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  request_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_at_idx ON audit_log(at);

CREATE TABLE auth_attempts (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, window_start)
);

INSERT INTO schema_meta (id, version, updated_at)
VALUES (1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
