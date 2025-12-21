const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { DB_DIR, DB_PATH } = require("../config");

let db;

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        return reject(err);
      }
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });

  db = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      resolve(database);
    });
  });

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS games (
      game_code TEXT PRIMARY KEY,
      host_socket_id TEXT,
      game_state TEXT,
      max_players INTEGER DEFAULT 3,
      rounds_per_player INTEGER DEFAULT 2,
      questions_per_round INTEGER DEFAULT 5,
      current_round INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      socket_id TEXT,
      game_code TEXT,
      username TEXT,
      score INTEGER DEFAULT 0,
      is_host BOOLEAN DEFAULT 0,
      user_id INTEGER,
      FOREIGN KEY (game_code) REFERENCES games(game_code),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`CREATE INDEX IF NOT EXISTS idx_players_game_code ON players(game_code)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_players_socket_id ON players(socket_id)`);
}

async function ensureGamesColumns() {
  const rows = await dbAll(`PRAGMA table_info(games)`);
  const existingColumns = new Set(rows.map((row) => row.name));

  const addColumnIfMissing = async (name, typeAndDefault) => {
    if (existingColumns.has(name)) return;
    await dbRun(`ALTER TABLE games ADD COLUMN ${name} ${typeAndDefault}`);
    existingColumns.add(name);
  };

  await addColumnIfMissing("max_players", "INTEGER DEFAULT 3");
  await addColumnIfMissing("rounds_per_player", "INTEGER DEFAULT 2");
  await addColumnIfMissing("questions_per_round", "INTEGER DEFAULT 5");
  await addColumnIfMissing("current_round", "INTEGER DEFAULT 0");
}

async function ensurePlayersColumns() {
  const rows = await dbAll(`PRAGMA table_info(players)`);
  const existingColumns = new Set(rows.map((row) => row.name));

  const addColumnIfMissing = async (name, typeAndDefault) => {
    if (existingColumns.has(name)) return;
    await dbRun(`ALTER TABLE players ADD COLUMN ${name} ${typeAndDefault}`);
    existingColumns.add(name);
  };

  await addColumnIfMissing("user_id", "INTEGER");
}

module.exports = {
  initDb,
  ensureGamesColumns,
  ensurePlayersColumns,
  dbRun,
  dbGet,
  dbAll
};
