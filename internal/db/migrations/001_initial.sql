CREATE TABLE players (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

INSERT INTO players (id, name, created_at) VALUES (1, 'Player', strftime('%s','now'));

CREATE TABLE item_catalog (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    tier         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    buy_cost     INTEGER NOT NULL,
    sell_value   INTEGER NOT NULL,
    effect_json  TEXT NOT NULL
);

CREATE TABLE hero_catalog (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    starting_hp  INTEGER NOT NULL,
    effect_json  TEXT NOT NULL
);

CREATE TABLE runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id    INTEGER NOT NULL REFERENCES players(id),
    hero_id      TEXT NOT NULL REFERENCES hero_catalog(id),
    status       TEXT NOT NULL,
    shop_seed    INTEGER NOT NULL,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER
);

CREATE INDEX idx_runs_player_status ON runs(player_id, status);

CREATE TABLE run_state (
    run_id           INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    day              INTEGER NOT NULL,
    gold             INTEGER NOT NULL,
    hp               INTEGER NOT NULL,
    shop_level       INTEGER NOT NULL,
    xp               INTEGER NOT NULL,
    shop_json        TEXT NOT NULL,
    hand_json        TEXT NOT NULL,
    board_json       TEXT NOT NULL,
    updated_at       INTEGER NOT NULL
);

CREATE TABLE encounters (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    day              INTEGER NOT NULL,
    opponent_board   TEXT NOT NULL,
    seed             INTEGER NOT NULL,
    status           TEXT NOT NULL,
    combat_log       TEXT,
    UNIQUE(run_id, day)
);

CREATE TABLE run_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id     INTEGER NOT NULL REFERENCES players(id),
    run_id        INTEGER NOT NULL REFERENCES runs(id),
    hero_id       TEXT NOT NULL,
    days_reached  INTEGER NOT NULL,
    outcome       TEXT NOT NULL,
    finished_at   INTEGER NOT NULL
);

CREATE TABLE art_assets (
    item_id       TEXT PRIMARY KEY REFERENCES item_catalog(id),
    prompt        TEXT NOT NULL,
    seed          INTEGER NOT NULL,
    model         TEXT NOT NULL,
    generated_at  INTEGER NOT NULL,
    sha256        TEXT NOT NULL
);
