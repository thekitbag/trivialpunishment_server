const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");
const { dbGet, dbRun } = require("../db");

async function signup(username, password) {
  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  if (typeof username !== "string" || typeof password !== "string") {
    throw new Error("Invalid username or password format");
  }

  const normalizedUsername = username.trim().toLowerCase();

  if (normalizedUsername.length < 3 || password.length < 6) {
    throw new Error("Username must be at least 3 characters and password at least 6 characters");
  }

  const existingUser = await dbGet(`SELECT id FROM users WHERE LOWER(username) = LOWER(?)`, [normalizedUsername]);
  if (existingUser) {
    const error = new Error("Username already exists");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await dbRun(
    `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
    [normalizedUsername, passwordHash]
  );

  const token = jwt.sign({ id: result.lastID, username: normalizedUsername }, JWT_SECRET, {
    expiresIn: "7d"
  });

  return {
    token,
    user: {
      id: result.lastID,
      username: normalizedUsername
    }
  };
}

async function login(username, password) {
  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  if (typeof username !== "string" || typeof password !== "string") {
    throw new Error("Invalid username or password format");
  }

  const normalizedUsername = username.trim().toLowerCase();

  const user = await dbGet(`SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)`, [
    normalizedUsername
  ]);

  if (!user) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d"
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username
    }
  };
}

module.exports = {
  signup,
  login
};
