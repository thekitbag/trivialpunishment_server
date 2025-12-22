const io = require("socket.io-client");

const SERVER_URL = "http://localhost:3001";

let hostSocket;
let player1Socket;
let player2Socket;
let gameCode;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("Starting game flow test...\n");

  // Create host socket
  hostSocket = io(SERVER_URL);

  await new Promise(resolve => {
    hostSocket.on("connect", () => {
      console.log("[Host] Connected");
      resolve();
    });
  });

  // Create game
  await new Promise(resolve => {
    hostSocket.emit("create_game", {
      maxPlayers: 2,
      roundsPerPlayer: 1,
      questionsPerRound: 2
    });

    hostSocket.on("game_created", (data) => {
      gameCode = data.gameCode;
      console.log(`[Host] Game created: ${gameCode}\n`);
      resolve();
    });
  });

  // Create player sockets
  player1Socket = io(SERVER_URL);
  player2Socket = io(SERVER_URL);

  await Promise.all([
    new Promise(resolve => player1Socket.on("connect", resolve)),
    new Promise(resolve => player2Socket.on("connect", resolve))
  ]);

  console.log("[Player1] Connected");
  console.log("[Player2] Connected\n");

  // Set up event listeners
  hostSocket.on("game_started", () => {
    console.log("[Host] Game started! Waiting for first question...\n");
  });

  hostSocket.on("question_start", (data) => {
    console.log(`[Host] Question ${data.round}/${data.totalRounds}: ${data.text}`);
    console.log(`Options: ${data.options.join(", ")}\n`);
  });

  player1Socket.on("question_start", async (data) => {
    console.log(`[Player1] Received question ${data.round}`);
    await sleep(500);
    player1Socket.emit("submit_answer", { answerIndex: 0, gameCode });
    console.log("[Player1] Submitted answer: 0\n");
  });

  player2Socket.on("question_start", async (data) => {
    console.log(`[Player2] Received question ${data.round}`);
    await sleep(1000);
    player2Socket.emit("submit_answer", { answerIndex: 0, gameCode });
    console.log("[Player2] Submitted answer: 0\n");
  });

  hostSocket.on("player_answered", (data) => {
    console.log(`[Host] Player answered: ${data.username}`);
  });

  hostSocket.on("round_reveal", (data) => {
    console.log(`[Host] Round reveal! Correct answer: ${data.correctIndex}`);
    console.log("Scores:", data.scores);
    console.log("");
  });

  hostSocket.on("game_over", (data) => {
    console.log("[Host] Game Over!");
    console.log("Final Scores:", data.scores);
    console.log("\nTest completed successfully!");

    setTimeout(() => {
      hostSocket.disconnect();
      player1Socket.disconnect();
      player2Socket.disconnect();
      process.exit(0);
    }, 1000);
  });

  // Join players
  player1Socket.emit("join_game", { username: "Alice", gameCode });
  await sleep(500);
  player2Socket.emit("join_game", { username: "Bob", gameCode });

  console.log("[Player1] Joined game");
  console.log("[Player2] Joined game - Game should start!\n");
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
