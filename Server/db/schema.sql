PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─────────────────────────────────────────
--  USERS & ROLES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('player','technician','quartermaster','gm')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
--  PLAYERS  (one-to-one with user)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  callsign    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
--  PILOT SPECIAL ABILITIES  (fixed list)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS psa_definitions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  min_rank    INTEGER NOT NULL DEFAULT 1  -- minimum rank required to take this PSA
);

-- ─────────────────────────────────────────
--  PILOTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilots (
  id                  TEXT PRIMARY KEY,
  player_id           TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  skill               INTEGER NOT NULL DEFAULT 4,  -- improves (lowers) with rank
  rank                INTEGER NOT NULL DEFAULT 0,  -- 0=Starting, 1-4
  xp_total            INTEGER NOT NULL DEFAULT 0,
  psa_slots_available INTEGER NOT NULL DEFAULT 0,
  psa_slots_used      INTEGER NOT NULL DEFAULT 0,
  rank_up_pending     INTEGER NOT NULL DEFAULT 0,  -- 1 = awaiting PSA selection modal
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pilot PSA selections
CREATE TABLE IF NOT EXISTS pilot_psas (
  id              TEXT PRIMARY KEY,
  pilot_id        TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  psa_def_id      TEXT NOT NULL REFERENCES psa_definitions(id),
  slot_index      INTEGER NOT NULL,
  awarded_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pilot_id, psa_def_id)
);

-- ─────────────────────────────────────────
--  UNITS  (player-owned)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units (
  id                  TEXT PRIMARY KEY,
  player_id           TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  variant             TEXT,
  unit_type           TEXT NOT NULL,  -- BM, CV, CF, BA, CI
  size                INTEGER NOT NULL,
  tonnage             INTEGER,
  role                TEXT,
  tmm                 INTEGER DEFAULT 0,
  base_pv             INTEGER NOT NULL,  -- default point value
  -- damage capacity
  armor_max           INTEGER NOT NULL,
  structure_max       INTEGER NOT NULL,
  engine_hits_max     INTEGER NOT NULL DEFAULT 2,
  fcu_hits_max        INTEGER NOT NULL DEFAULT 4,
  mp_hits_max         INTEGER NOT NULL DEFAULT 4,
  weapon_hits_max     INTEGER NOT NULL DEFAULT 4,
  -- current damage state (counts of damaged pips)
  armor_dmg           INTEGER NOT NULL DEFAULT 0,
  structure_dmg       INTEGER NOT NULL DEFAULT 0,
  engine_dmg          INTEGER NOT NULL DEFAULT 0,
  fcu_dmg             INTEGER NOT NULL DEFAULT 0,
  mp_dmg              INTEGER NOT NULL DEFAULT 0,
  weapon_dmg          INTEGER NOT NULL DEFAULT 0,
  -- metadata
  abilities           TEXT,   -- JSON array string
  move_data           TEXT,   -- JSON array string
  image_url           TEXT,
  jump_move           INTEGER DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK(status IN ('active','destroyed','retired','forsale')),
  jeff_uuid           TEXT,   -- original UUID from Jeff's tool for deduplication
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pilot assigned to unit (one active assignment per unit at a time)
CREATE TABLE IF NOT EXISTS pilot_unit_assignments (
  id          TEXT PRIMARY KEY,
  pilot_id    TEXT NOT NULL REFERENCES pilots(id),
  unit_id     TEXT NOT NULL REFERENCES units(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  unassigned_at TEXT,  -- NULL means currently active
  UNIQUE(unit_id, unassigned_at)  -- only one active pilot per unit
);

-- ─────────────────────────────────────────
--  XP EVENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_events (
  id            TEXT PRIMARY KEY,
  pilot_id      TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  session_id    TEXT REFERENCES sessions(id),
  event_type    TEXT NOT NULL
                  CHECK(event_type IN (
                    'damage_tac','damage_critical','damage_melee',
                    'kill','objective_hold','objective_action','manual'
                  )),
  xp_awarded    INTEGER NOT NULL,
  notes         TEXT,
  awarded_by    TEXT REFERENCES users(id),
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
--  NOTIFICATIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK(type IN ('rank_up','psa_available','repair_complete','salvage_available','general')),
  title       TEXT NOT NULL,
  body        TEXT,
  pilot_id    TEXT REFERENCES pilots(id),
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
--  CONTRACTS & SESSIONS
-- ─────────────────────────────────────────
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
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'setup'
                  CHECK(status IN ('setup','active','post','complete')),
  -- post-session phase flags
  salvage_done  INTEGER NOT NULL DEFAULT 0,
  xp_done       INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL REFERENCES users(id),
  started_at    TEXT,
  ended_at      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_objectives (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  objective_type TEXT NOT NULL CHECK(objective_type IN ('hold','action','kill','custom')),
  xp_reward     INTEGER NOT NULL DEFAULT 1,
  completed     INTEGER NOT NULL DEFAULT 0,
  completed_by_pilot_id TEXT REFERENCES pilots(id),
  completed_at  TEXT
);

-- ─────────────────────────────────────────
--  PLAY MODE — ENEMY UNITS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enemy_units (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  jeff_uuid             TEXT,
  name                  TEXT NOT NULL,
  variant               TEXT,
  unit_type             TEXT NOT NULL,
  size                  INTEGER NOT NULL,
  base_pv               INTEGER NOT NULL,
  tonnage               INTEGER,
  role                  TEXT,
  tmm                   INTEGER DEFAULT 0,
  pilot_skill           INTEGER NOT NULL DEFAULT 4,
  -- damage capacities (derived from import)
  armor_max             INTEGER NOT NULL,
  structure_max         INTEGER NOT NULL,
  engine_hits_max       INTEGER NOT NULL DEFAULT 2,
  fcu_hits_max          INTEGER NOT NULL DEFAULT 4,
  mp_hits_max           INTEGER NOT NULL DEFAULT 4,
  weapon_hits_max       INTEGER NOT NULL DEFAULT 4,
  -- current damage (counts)
  armor_dmg             INTEGER NOT NULL DEFAULT 0,
  structure_dmg         INTEGER NOT NULL DEFAULT 0,
  engine_dmg            INTEGER NOT NULL DEFAULT 0,
  fcu_dmg               INTEGER NOT NULL DEFAULT 0,
  mp_dmg                INTEGER NOT NULL DEFAULT 0,
  weapon_dmg            INTEGER NOT NULL DEFAULT 0,
  -- outcome
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK(status IN ('active','destroyed','withdrawn')),
  kill_credit_pilot_id  TEXT REFERENCES pilots(id),  -- pilot who got kill credit
  -- metadata
  abilities             TEXT,  -- JSON array string
  move_data             TEXT,  -- JSON array string
  image_url             TEXT,
  group_name            TEXT,  -- lance/group label from Jeff's tool
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kill damage log — tracks which pilots damaged an enemy unit this turn
CREATE TABLE IF NOT EXISTS kill_damage_log (
  id              TEXT PRIMARY KEY,
  enemy_unit_id   TEXT NOT NULL REFERENCES enemy_units(id) ON DELETE CASCADE,
  pilot_id        TEXT NOT NULL REFERENCES pilots(id),
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  damage_type     TEXT NOT NULL CHECK(damage_type IN ('tac','critical','melee')),
  turn_number     INTEGER NOT NULL DEFAULT 1,
  logged_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
--  SALVAGE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salvage_queue (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT NOT NULL REFERENCES sessions(id),
  enemy_unit_id           TEXT NOT NULL REFERENCES enemy_units(id),
  -- calculated at salvage review time
  repair_cost             INTEGER NOT NULL DEFAULT 0,
  salvage_value           INTEGER NOT NULL DEFAULT 0,  -- base_pv - repair_cost
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','claimed','dismissed')),
  claimed_by_player_id    TEXT REFERENCES players(id),
  kill_credit_pilot_id    TEXT REFERENCES pilots(id),  -- preserved from enemy_unit
  claimed_at              TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
--  REPAIRS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repair_jobs (
  id                  TEXT PRIMARY KEY,
  unit_id             TEXT NOT NULL REFERENCES units(id),
  technician_user_id  TEXT REFERENCES users(id),
  -- what was repaired
  armor_restored      INTEGER NOT NULL DEFAULT 0,
  structure_restored  INTEGER NOT NULL DEFAULT 0,
  engine_restored     INTEGER NOT NULL DEFAULT 0,
  fcu_restored        INTEGER NOT NULL DEFAULT 0,
  mp_restored         INTEGER NOT NULL DEFAULT 0,
  weapon_restored     INTEGER NOT NULL DEFAULT 0,
  -- cost
  repair_cost         INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','approved','complete','cancelled')),
  approved_by         TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at        TEXT
);

-- ─────────────────────────────────────────
--  ACCOUNTING
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_ledger (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL
                    CHECK(type IN (
                      'deposit_manual','deposit_mission','deposit_sale',
                      'deposit_salvage_value',
                      'withdraw_manual','withdraw_purchase',
                      'withdraw_repair','withdraw_salvage_claim'
                    )),
  amount          INTEGER NOT NULL,   -- always positive; type determines direction
  balance_after   INTEGER NOT NULL,
  description     TEXT NOT NULL,
  -- optional links
  unit_id         TEXT REFERENCES units(id),
  session_id      TEXT REFERENCES sessions(id),
  repair_job_id   TEXT REFERENCES repair_jobs(id),
  salvage_id      TEXT REFERENCES salvage_queue(id),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row campaign balance (updated via trigger / app logic)
CREATE TABLE IF NOT EXISTS campaign_account (
  id      INTEGER PRIMARY KEY CHECK(id = 1),
  balance INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO campaign_account(id, balance) VALUES(1, 0);

-- ─────────────────────────────────────────
--  INDEXES
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pilots_player      ON pilots(player_id);
CREATE INDEX IF NOT EXISTS idx_units_player       ON units(player_id);
CREATE INDEX IF NOT EXISTS idx_xp_events_pilot    ON xp_events(pilot_id);
CREATE INDEX IF NOT EXISTS idx_xp_events_session  ON xp_events(session_id);
CREATE INDEX IF NOT EXISTS idx_enemy_units_sess   ON enemy_units(session_id);
CREATE INDEX IF NOT EXISTS idx_kill_log_enemy     ON kill_damage_log(enemy_unit_id);
CREATE INDEX IF NOT EXISTS idx_kill_log_pilot     ON kill_damage_log(pilot_id);
CREATE INDEX IF NOT EXISTS idx_salvage_session    ON salvage_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_ledger_type        ON account_ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_created     ON account_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_repair_unit        ON repair_jobs(unit_id);
CREATE INDEX IF NOT EXISTS idx_sessions_contract  ON sessions(contract_id);
