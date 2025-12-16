const http = require("http");

const cors = require("cors");
const express = require("express");
const ip = require("ip");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());

app.get("/", (_req, res) => {
  res.status(200).send("Hello World");
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

let players = [];

function emitPlayerList() {
  io.emit("update_player_list", players);
}

io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on("join_game", (payload) => {
    const username =
      typeof payload === "string"
        ? payload
        : payload && typeof payload.username === "string"
          ? payload.username
          : "";

    const normalizedUsername = username.trim();
    if (!normalizedUsername) return;

    players = players.filter((player) => player.id !== socket.id);
    players.push({
      id: socket.id,
      username: normalizedUsername,
      score: 0,
      isHost: false
    });

    emitPlayerList();
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    players = players.filter((player) => player.id !== socket.id);
    emitPlayerList();
  });
});

httpServer.listen(PORT, () => {
  const lanIp = ip.address();
  console.log(`[http] listening on http://localhost:${PORT}`);
  console.log(`[lan]  listening on http://${lanIp}:${PORT}`);
});

