-- Alpha Strike Campaign Tracker — D1 Schema
-- Applied via: wrangler d1 migrations apply campaign-db

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('player','technician','quartermaster','gm')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  callsign   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS psa_definitions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  min_rank    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pilots (
  id                  TEXT PRIMARY KEY,
  player_id           TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  skill               INTEGER NOT NULL DEFAULT 4,
  rank                INTEGER NOT NULL DEFAULT 0,
  xp_total            INTEGER NOT NULL DEFAULT 0,
  psa_slots_available INTEGER NOT NULL DEFAULT 0,
  psa_slots_used      INTEGER NOT NULL DEFAULT 0,
  rank_up_pending     INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pilot_psas (
  id         TEXT PRIMARY KEY,
  pilot_id   TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  psa_def_id TEXT NOT NULL REFERENCES psa_definitions(id),
  slot_index INTEGER NOT NULL,
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pilot_id, psa_def_id)
);

CREATE TABLE IF NOT EXISTS units (
  id              TEXT PRIMARY KEY,
  player_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  variant         TEXT,
  unit_type       TEXT NOT NULL,
  size            INTEGER NOT NULL,
  tonnage         INTEGER,
  role            TEXT,
  tmm             INTEGER DEFAULT 0,
  base_pv         INTEGER NOT NULL,
  armor_max       INTEGER NOT NULL,
  structure_max   INTEGER NOT NULL,
  engine_hits_max INTEGER NOT NULL DEFAULT 2,
  fcu_hits_max    INTEGER NOT NULL DEFAULT 4,
  mp_hits_max     INTEGER NOT NULL DEFAULT 4,
  weapon_hits_max INTEGER NOT NULL DEFAULT 4,
  armor_dmg       INTEGER NOT NULL DEFAULT 0,
  structure_dmg   INTEGER NOT NULL DEFAULT 0,
  engine_dmg      INTEGER NOT NULL DEFAULT 0,
  fcu_dmg         INTEGER NOT NULL DEFAULT 0,
  mp_dmg          INTEGER NOT NULL DEFAULT 0,
  weapon_dmg      INTEGER NOT NULL DEFAULT 0,
  abilities       TEXT,
  move_data       TEXT,
  image_url       TEXT,
  jump_move       INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','destroyed','retired','forsale')),
  jeff_uuid       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pilot_unit_assignments (
  id            TEXT PRIMARY KEY,
  pilot_id      TEXT NOT NULL REFERENCES pilots(id),
  unit_id       TEXT NOT NULL REFERENCES units(id),
  assigned_at   TEXT NOT NULL DEFAULT (datetime('now')),
  unassigned_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','complete','abandoned')),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES contracts(id),
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'setup'
                 CHECK(status IN ('setup','active','post','complete')),
  salvage_done INTEGER NOT NULL DEFAULT 0,
  xp_done      INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL REFERENCES users(id),
  started_at   TEXT,
  ended_at     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_objectives (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  objective_type        TEXT NOT NULL CHECK(objective_type IN ('hold','action','kill','custom')),
  xp_reward             INTEGER NOT NULL DEFAULT 1,
  completed             INTEGER NOT NULL DEFAULT 0,
  completed_by_pilot_id TEXT REFERENCES pilots(id),
  completed_at          TEXT
);

CREATE TABLE IF NOT EXISTS xp_events (
  id          TEXT PRIMARY KEY,
  pilot_id    TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES sessions(id),
  event_type  TEXT NOT NULL,
  xp_awarded  INTEGER NOT NULL,
  notes       TEXT,
  awarded_by  TEXT REFERENCES users(id),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  pilot_id   TEXT REFERENCES pilots(id),
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enemy_units (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  jeff_uuid            TEXT,
  name                 TEXT NOT NULL,
  variant              TEXT,
  unit_type            TEXT NOT NULL,
  size                 INTEGER NOT NULL,
  base_pv              INTEGER NOT NULL,
  tonnage              INTEGER,
  role                 TEXT,
  tmm                  INTEGER DEFAULT 0,
  pilot_skill          INTEGER NOT NULL DEFAULT 4,
  armor_max            INTEGER NOT NULL,
  structure_max        INTEGER NOT NULL,
  engine_hits_max      INTEGER NOT NULL DEFAULT 2,
  fcu_hits_max         INTEGER NOT NULL DEFAULT 4,
  mp_hits_max          INTEGER NOT NULL DEFAULT 4,
  weapon_hits_max      INTEGER NOT NULL DEFAULT 4,
  armor_dmg            INTEGER NOT NULL DEFAULT 0,
  structure_dmg        INTEGER NOT NULL DEFAULT 0,
  engine_dmg           INTEGER NOT NULL DEFAULT 0,
  fcu_dmg              INTEGER NOT NULL DEFAULT 0,
  mp_dmg               INTEGER NOT NULL DEFAULT 0,
  weapon_dmg           INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active','destroyed','withdrawn')),
  kill_credit_pilot_id TEXT REFERENCES pilots(id),
  abilities            TEXT,
  move_data            TEXT,
  image_url            TEXT,
  group_name           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kill_damage_log (
  id            TEXT PRIMARY KEY,
  enemy_unit_id TEXT NOT NULL REFERENCES enemy_units(id) ON DELETE CASCADE,
  pilot_id      TEXT NOT NULL REFERENCES pilots(id),
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  damage_type   TEXT NOT NULL CHECK(damage_type IN ('tac','critical','melee')),
  turn_number   INTEGER NOT NULL DEFAULT 1,
  logged_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salvage_queue (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES sessions(id),
  enemy_unit_id        TEXT NOT NULL REFERENCES enemy_units(id),
  repair_cost          INTEGER NOT NULL DEFAULT 0,
  salvage_value        INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','claimed','dismissed')),
  claimed_by_player_id TEXT REFERENCES players(id),
  kill_credit_pilot_id TEXT REFERENCES pilots(id),
  claimed_at           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repair_jobs (
  id                 TEXT PRIMARY KEY,
  unit_id            TEXT NOT NULL REFERENCES units(id),
  technician_user_id TEXT REFERENCES users(id),
  armor_restored     INTEGER NOT NULL DEFAULT 0,
  structure_restored INTEGER NOT NULL DEFAULT 0,
  engine_restored    INTEGER NOT NULL DEFAULT 0,
  fcu_restored       INTEGER NOT NULL DEFAULT 0,
  mp_restored        INTEGER NOT NULL DEFAULT 0,
  weapon_restored    INTEGER NOT NULL DEFAULT 0,
  repair_cost        INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','approved','complete','cancelled')),
  approved_by        TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at       TEXT
);

CREATE TABLE IF NOT EXISTS account_ledger (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description   TEXT NOT NULL,
  unit_id       TEXT REFERENCES units(id),
  session_id    TEXT REFERENCES sessions(id),
  repair_job_id TEXT REFERENCES repair_jobs(id),
  salvage_id    TEXT REFERENCES salvage_queue(id),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaign_account (
  id      INTEGER PRIMARY KEY CHECK(id = 1),
  balance INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO campaign_account(id, balance) VALUES(1, 0);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pilots_player     ON pilots(player_id);
CREATE INDEX IF NOT EXISTS idx_units_player      ON units(player_id);
CREATE INDEX IF NOT EXISTS idx_xp_pilot          ON xp_events(pilot_id);
CREATE INDEX IF NOT EXISTS idx_enemy_session     ON enemy_units(session_id);
CREATE INDEX IF NOT EXISTS idx_kill_log_enemy    ON kill_damage_log(enemy_unit_id);
CREATE INDEX IF NOT EXISTS idx_salvage_session   ON salvage_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_ledger_created    ON account_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_repair_unit       ON repair_jobs(unit_id);
CREATE INDEX IF NOT EXISTS idx_sessions_contract ON sessions(contract_id);
