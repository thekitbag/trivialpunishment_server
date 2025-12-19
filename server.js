require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");

const cors = require("cors");
const express = require("express");
const ip = require("ip");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.PORT) || 3001;
const DB_DIR = path.join(__dirname, "server");
const DB_PATH = path.join(DB_DIR, "game_data.db");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).send("Hello World");
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Invalid username or password format" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    if (normalizedUsername.length < 3 || password.length < 6) {
      return res.status(400).json({ error: "Username must be at least 3 characters and password at least 6 characters" });
    }

    const existingUser = await dbGet(`SELECT id FROM users WHERE LOWER(username) = LOWER(?)`, [normalizedUsername]);
    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
      [normalizedUsername, passwordHash]
    );

    const token = jwt.sign({ id: result.lastID, username: normalizedUsername }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.status(201).json({
      token,
      user: {
        id: result.lastID,
        username: normalizedUsername
      }
    });
  } catch (err) {
    console.error("[signup] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Invalid username or password format" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const user = await dbGet(`SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)`, [
      normalizedUsername
    ]);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (err) {
    console.error("[login] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

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

function randomGameCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

async function generateUniqueGameCode(maxAttempts = 25) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = randomGameCode();
    const existing = await dbGet(`SELECT game_code FROM games WHERE game_code = ?`, [code]);
    if (!existing) return code;
  }
  throw new Error("Unable to generate unique game code");
}

async function getPlayersForGame(gameCode) {
  const rows = await dbAll(
    `
      SELECT socket_id, username, score, is_host
      FROM players
      WHERE game_code = ? AND socket_id IS NOT NULL
      ORDER BY id ASC
    `,
    [gameCode]
  );

  return rows.map((row) => ({
    id: row.socket_id,
    username: row.username,
    score: row.score,
    isHost: Boolean(row.is_host)
  }));
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const intValue = Math.trunc(num);
  if (intValue < min || intValue > max) return fallback;
  return intValue;
}

async function getGame(gameCode) {
  return dbGet(
    `
      SELECT game_code, host_socket_id, game_state, max_players, rounds_per_player, questions_per_round, current_round
      FROM games
      WHERE game_code = ?
    `,
    [gameCode]
  );
}

async function emitPlayerListToRoom(gameCode) {
  const players = await getPlayersForGame(gameCode);
  io.to(gameCode).emit("update_player_list", players);
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    socket.user = { id: null, username: "Guest", isGuest: true };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = { id: decoded.id, username: decoded.username, isGuest: false };
    next();
  } catch (err) {
    console.error("[socket auth] invalid token:", err.message);
    socket.user = { id: null, username: "Guest", isGuest: true };
    next();
  }
});

io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id} (user: ${socket.user.username})`);

  socket.on("create_game", async (payload) => {
    try {
      const maxPlayers = clampInt(payload?.maxPlayers, 2, 8, 3);
      const roundsPerPlayer = clampInt(payload?.roundsPerPlayer, 1, 5, 2);
      const questionsPerRound = clampInt(payload?.questionsPerRound, 3, 10, 5);

      const gameCode = await generateUniqueGameCode();
      
      await dbRun(
        `
          INSERT INTO games (
            game_code,
            host_socket_id,
            game_state,
            max_players,
            rounds_per_player,
            questions_per_round,
            current_round
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [gameCode, socket.id, "LOBBY", maxPlayers, roundsPerPlayer, questionsPerRound, 0]
      );
      
      socket.join(gameCode);
      socket.emit("game_created", {
        gameCode,
        maxPlayers,
        roundsPerPlayer,
        questionsPerRound
      });
      await emitPlayerListToRoom(gameCode);
    } catch (err) {
      console.error("[create_game] failed", err);
      socket.emit("error", "Unable to create game");
    }
  });

  socket.on("join_game", async (payload) => {
    try {
      const username = payload && typeof payload.username === "string" ? payload.username : "";
      const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";

      const normalizedUsername = username.trim();
      const gameCode = gameCodeRaw.trim().toUpperCase();
      if (!normalizedUsername || gameCode.length !== 4) {
        socket.emit("error", "Invalid join payload");
        return;
      }

      const game = await getGame(gameCode);
      if (!game) {
        socket.emit("error", "Game not found");
        return;
      }

      socket.join(gameCode);

      const existingPlayer = await dbGet(
        `SELECT id FROM players WHERE game_code = ? AND username = ? LIMIT 1`,
        [gameCode, normalizedUsername]
      );

      const playerCountRow = await dbGet(`SELECT COUNT(*) AS count FROM players WHERE game_code = ?`, [
        gameCode
      ]);
      const playerCount = Number(playerCountRow?.count) || 0;
      const maxPlayers = Number(game.max_players) || 3;

      if (!existingPlayer && playerCount >= maxPlayers) {
        socket.emit("error", "Room Full");
        socket.leave(gameCode);
        return;
      }

      if (!existingPlayer && game.game_state && game.game_state !== "LOBBY") {
        socket.emit("error", "Game already started");
        socket.leave(gameCode);
        return;
      }

      if (existingPlayer) {
        await dbRun(`UPDATE players SET socket_id = ? WHERE id = ?`, [socket.id, existingPlayer.id]);
      } else {
        await dbRun(
          `INSERT INTO players (socket_id, game_code, username, score, is_host) VALUES (?, ?, ?, ?, ?)`,
          [socket.id, gameCode, normalizedUsername, 0, 0]
        );
      }

      const updatedCountRow = await dbGet(`SELECT COUNT(*) AS count FROM players WHERE game_code = ?`, [
        gameCode
      ]);
      const updatedCount = Number(updatedCountRow?.count) || 0;

      if (game.game_state === "LOBBY" && updatedCount === maxPlayers) {
        await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, ["STARTING", gameCode]);
        io.to(gameCode).emit("game_started");
      }

      await emitPlayerListToRoom(gameCode);
    } catch (err) {
      console.error("[join_game] failed", err);
      socket.emit("error", "Unable to join game");
    }
  });

  socket.on("reconnect_host", async (payload) => {
    try {
      const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";
      const gameCode = gameCodeRaw.trim().toUpperCase();
      if (gameCode.length !== 4) {
        socket.emit("error", "Invalid game code");
        return;
      }

      const game = await getGame(gameCode);
      if (!game) {
        socket.emit("error", "Game not found");
        return;
      }

      await dbRun(`UPDATE games SET host_socket_id = ? WHERE game_code = ?`, [socket.id, gameCode]);
      socket.join(gameCode);

      socket.emit("host_reconnected", {
        gameCode,
        gameState: game.game_state,
        maxPlayers: game.max_players,
        roundsPerPlayer: game.rounds_per_player,
        questionsPerRound: game.questions_per_round,
        currentRound: game.current_round
      });

      await emitPlayerListToRoom(gameCode);
    } catch (err) {
      console.error("[reconnect_host] failed", err);
      socket.emit("error", "Unable to reconnect host");
    }
  });

  socket.on("request_player_list", async (payload) => {
    try {
      const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";
      const gameCode = gameCodeRaw.trim().toUpperCase();
      if (gameCode.length !== 4) {
        socket.emit("error", "Invalid game code");
        return;
      }

      const players = await getPlayersForGame(gameCode);
      socket.emit("update_player_list", players);
    } catch (err) {
      console.error("[request_player_list] failed", err);
      socket.emit("error", "Unable to fetch player list");
    }
  });

  socket.on("disconnect", async (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    try {
      const affectedGames = await dbAll(
        `SELECT DISTINCT game_code FROM players WHERE socket_id = ?`,
        [socket.id]
      );

      await dbRun(`UPDATE players SET socket_id = NULL WHERE socket_id = ?`, [socket.id]);
      await dbRun(`UPDATE games SET host_socket_id = NULL WHERE host_socket_id = ?`, [socket.id]);

      await Promise.all(
        affectedGames
          .map((row) => row.game_code)
          .filter(Boolean)
          .map((gameCode) => emitPlayerListToRoom(gameCode))
      );
    } catch (err) {
      console.error("[disconnect] cleanup failed", err);
    }
  });
});

async function start() {
  await initDb();
  await ensureGamesColumns();
  await ensurePlayersColumns();

  httpServer.listen(PORT, () => {
    const lanIp = ip.address();
    console.log(`[http] listening on http://localhost:${PORT}`);
    console.log(`[lan]  listening on http://${lanIp}:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[startup] failed", err);
  process.exitCode = 1;
});