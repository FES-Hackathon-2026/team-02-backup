-- ReMain — the whole schema, in one file, executed at boot.
--
-- No migration tool on purpose: at hackathon speed a migration runner is a
-- thing that breaks at 3 a.m., and the data here is seeded rather than
-- precious. Everything is CREATE TABLE IF NOT EXISTS, so a restart is safe
-- and additive changes are one more statement.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------
-- People and places
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS districts (
  id        TEXT PRIMARY KEY,      -- slug, matches app/src/lib/frankfurt.ts
  name      TEXT NOT NULL,
  bezirk    INTEGER NOT NULL,      -- Ortsbezirk 1-16
  lat       REAL NOT NULL,
  lon       REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  district_id  TEXT NOT NULL REFERENCES districts(id),
  role         TEXT NOT NULL DEFAULT 'citizen',   -- citizen | business
  is_demo      INTEGER NOT NULL DEFAULT 0,        -- seeded, not a real sign-up
  created_at   TEXT NOT NULL
);

-- Real Frankfurt facilities from OpenStreetMap. Not invented, not editable
-- by the app — refreshed by scripts/fetch-places.mjs.
CREATE TABLE IF NOT EXISTS places (
  id             TEXT PRIMARY KEY,   -- "node/123456"
  kind           TEXT NOT NULL,      -- wertstoffhof | glascontainer | altkleider | entsorgung | reparatur | secondhand
  name           TEXT NOT NULL,
  lat            REAL NOT NULL,
  lon            REAL NOT NULL,
  addr           TEXT,
  postcode       TEXT,
  opening_hours  TEXT,
  operator       TEXT,
  is_fes         INTEGER NOT NULL DEFAULT 0,
  website        TEXT,
  phone          TEXT,
  source         TEXT NOT NULL DEFAULT 'openstreetmap'
);

CREATE INDEX IF NOT EXISTS places_kind ON places(kind);

-- --------------------------------------------------------------------
-- Evidence
-- --------------------------------------------------------------------

-- Photos arrive already downscaled and re-encoded by the browser, which is
-- what drops the EXIF block. Position and capture time travel as explicit
-- fields the person agreed to send, not as metadata smuggled in the file.
CREATE TABLE IF NOT EXISTS photos (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  mime        TEXT NOT NULL,
  bytes       BLOB NOT NULL,
  byte_size   INTEGER NOT NULL,
  lat         REAL,
  lon         REAL,
  taken_at    TEXT,
  created_at  TEXT NOT NULL
);

-- One row per thing a person did. The ledger points here, the receipt reads
-- from here, and every feature writes here rather than inventing its own
-- notion of "an action".
CREATE TABLE IF NOT EXISTS actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,     -- quest | pickup | market | review | food | vytal
  ref_table   TEXT,
  ref_id      TEXT,
  status      TEXT NOT NULL,     -- open | pending | confirmed | rejected
  /** confirmed | plausible | pending | estimated | unmatched */
  tier        TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS actions_user ON actions(user_id, created_at DESC);

-- --------------------------------------------------------------------
-- Features
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quests (
  id             TEXT PRIMARY KEY,
  created_by     INTEGER REFERENCES users(id),
  title          TEXT NOT NULL,
  note           TEXT,
  category       TEXT NOT NULL DEFAULT 'muell',
  lat            REAL NOT NULL,
  lon            REAL NOT NULL,
  district_id    TEXT REFERENCES districts(id),
  photo_id       TEXT REFERENCES photos(id),
  xp             INTEGER NOT NULL DEFAULT 60,
  status         TEXT NOT NULL DEFAULT 'open',  -- open | claimed | submitted | confirmed
  claimed_by     INTEGER REFERENCES users(id),
  claimed_until  TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quests_status ON quests(status);

CREATE TABLE IF NOT EXISTS quest_submissions (
  id            TEXT PRIMARY KEY,
  quest_id      TEXT NOT NULL REFERENCES quests(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  photo_id      TEXT REFERENCES photos(id),
  verdict       TEXT,              -- plausible | unmatched | pending
  confidence    REAL,
  reasons_json  TEXT,              -- the four signals, each with its own source
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS peer_reviews (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT NOT NULL REFERENCES quest_submissions(id),
  user_id        INTEGER NOT NULL REFERENCES users(id),
  answer         TEXT NOT NULL,    -- clean | not_clean | cannot_see
  created_at     TEXT NOT NULL,
  UNIQUE (submission_id, user_id)  -- nobody reviews the same thing twice
);

CREATE TABLE IF NOT EXISTS market_items (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),
  title        TEXT NOT NULL,
  defect       TEXT NOT NULL,
  condition    TEXT,
  category     TEXT NOT NULL,     -- elektro | moebel | fahrrad | sonstiges
  district_id  TEXT REFERENCES districts(id),
  lat          REAL,
  lon          REAL,
  photo_id     TEXT REFERENCES photos(id),
  status       TEXT NOT NULL DEFAULT 'open',  -- open | reserved | handed_over | withdrawn
  claimed_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pickups (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  address      TEXT NOT NULL,
  district_id  TEXT REFERENCES districts(id),
  category     TEXT NOT NULL,
  volume_m3    REAL,
  slot_date    TEXT NOT NULL,
  reference    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'booked',   -- booked | cancelled | collected
  /** 'simulated' until FES gives us a real endpoint — shown on the receipt */
  source       TEXT NOT NULL DEFAULT 'simulated',
  created_at   TEXT NOT NULL
);

-- --------------------------------------------------------------------
-- Reward ledger. Append-only: nothing in here is ever updated or deleted,
-- which is what lets a receipt be trusted after the fact.
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ledger_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  action_id    INTEGER REFERENCES actions(id),
  xp           INTEGER NOT NULL DEFAULT 0,
  coins        INTEGER NOT NULL DEFAULT 0,
  reason       TEXT NOT NULL,
  tier         TEXT NOT NULL,     -- confirmed | plausible | estimated | simulated
  /** partner event id, so one event can never be paid twice */
  event_key    TEXT UNIQUE,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ledger_user ON ledger_entries(user_id);

CREATE TABLE IF NOT EXISTS redemptions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  coupon_id   TEXT NOT NULL,
  code        TEXT NOT NULL,
  coins       INTEGER NOT NULL,
  valid_until TEXT,
  created_at  TEXT NOT NULL
);
