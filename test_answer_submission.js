const io = require("socket.io-client");

const SERVER_URL = "http://localhost:3001";

async function test() {
  console.log("Testing answer submission...\n");

  const host = io(SERVER_URL);
  const player1 = io(SERVER_URL);
  const player2 = io(SERVER_URL);

  await Promise.all([
    new Promise(resolve => host.on("connect", resolve)),
    new Promise(resolve => player1.on("connect", resolve)),
    new Promise(resolve => player2.on("connect", resolve))
  ]);

  console.log("All sockets connected\n");

  let gameCode;

  host.emit("create_game", { maxPlayers: 2, roundsPerPlayer: 1, questionsPerRound: 1 });

  await new Promise(resolve => {
    host.on("game_created", (data) => {
      gameCode = data.gameCode;
      console.log(`Game created: ${gameCode}\n`);
      resolve();
    });
  });

  host.on("question_start", (data) => {
    console.log(`[Host] Question started: ${data.text}`);
    console.log(`[Host] Waiting for player answers...\n`);
  });

  player1.on("question_start", (data) => {
    console.log(`[Player1] Received question`);
    console.log(`[Player1] Submitting answer with gameCode: ${gameCode}`);

    const payload = { answerIndex: 0, gameCode: gameCode };
    console.log(`[Player1] Payload:`, JSON.stringify(payload));

    player1.emit("submit_answer", payload);
    console.log(`[Player1] Answer submitted!\n`);
  });

  player2.on("question_start", (data) => {
    console.log(`[Player2] Received question`);
    console.log(`[Player2] Submitting answer with gameCode: ${gameCode}`);

    const payload = { answerIndex: 1, gameCode: gameCode };
    console.log(`[Player2] Payload:`, JSON.stringify(payload));

    player2.emit("submit_answer", payload);
    console.log(`[Player2] Answer submitted!\n`);
  });

  host.on("player_answered", (data) => {
    console.log(`[Host] Player answered notification:`, data);
  });

  player1.on("error", (msg) => {
    console.log(`[Player1] ERROR:`, msg);
  });

  player2.on("error", (msg) => {
    console.log(`[Player2] ERROR:`, msg);
  });

  host.on("game_over", () => {
    console.log("\nTest complete!");
    setTimeout(() => {
      host.disconnect();
      player1.disconnect();
      player2.disconnect();
      process.exit(0);
    }, 500);
  });

  player1.emit("join_game", { username: "Player1", gameCode });
  player2.emit("join_game", { username: "Player2", gameCode });

  console.log("Players joining...\n");
}

test().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
