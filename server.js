const http = require("http");
const ip = require("ip");
const { PORT } = require("./src/config");
const { initDb, ensureGamesColumns, ensurePlayersColumns } = require("./src/db");
const app = require("./src/app");
const createSocketServer = require("./src/socket");

async function start() {
  await initDb();
  await ensureGamesColumns();
  await ensurePlayersColumns();

  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);

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
