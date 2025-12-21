const express = require("express");
const cors = require("cors");
const ip = require("ip");
const os = require("os");
const authService = require("./services/authService");

const app = express();
app.use(cors());
app.use(express.json());

// HTTP Request Logging Middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [HTTP] ${req.method} ${req.path}`);
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    console.log(`[${timestamp}] [HTTP] Body:`, JSON.stringify(req.body));
  }
  next();
});

// Health check endpoint
app.get("/", (_req, res) => {
  res.status(200).send("Hello World");
});

// Network Info Endpoint
app.get("/api/info", (_req, res) => {
  res.json({
    ip: ip.address(),
    hostname: os.hostname()
  });
});

// Auth endpoints
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authService.signup(username, password);
    res.status(201).json(result);
  } catch (err) {
    console.error("[signup] error:", err);
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.status(200).json(result);
  } catch (err) {
    console.error("[login] error:", err);
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({ error: err.message });
  }
});

module.exports = app;