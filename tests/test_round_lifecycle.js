const io = require("socket.io-client");

const SERVER_URL = "http://localhost:3001";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("Testing Round Lifecycle (Topic Selection & Round Over)...\n");

  const host = io(SERVER_URL);
  const player1 = io(SERVER_URL);
  const player2 = io(SERVER_URL);

  await Promise.all([
    new Promise(resolve => host.on("connect", resolve)),
    new Promise(resolve => player1.on("connect", resolve)),
    new Promise(resolve => player2.on("connect", resolve))
  ]);

  console.log("✓ All sockets connected\n");

  let gameCode;

  // Host creates game
  host.emit("create_game", { maxPlayers: 2, roundsPerPlayer: 2, questionsPerRound: 2 });

  await new Promise(resolve => {
    host.on("game_created", (data) => {
      gameCode = data.gameCode;
      console.log(`✓ Game created: ${gameCode} (2 rounds, 2 questions per round)\n`);
      resolve();
    });
  });

  // Listen for topic events
  host.on("topic_waiting", (data) => {
    console.log(`[Host] Waiting for ${data.pickerUsername} to pick topic (Round ${data.round}/${data.totalRounds})`);
  });

  player1.on("topic_request", (data) => {
    console.log(`[Player1] You are the topic picker! (Round ${data.round}/${data.totalRounds})`);
    setTimeout(() => {
      player1.emit("submit_topic", { topic: "Science", gameCode });
      console.log(`[Player1] Submitted topic: Science`);
    }, 1000);
  });

  player2.on("topic_request", (data) => {
    console.log(`[Player2] You are the topic picker! (Round ${data.round}/${data.totalRounds})`);
    setTimeout(() => {
      player2.emit("submit_topic", { topic: "History", gameCode });
      console.log(`[Player2] Submitted topic: History`);
    }, 1000);
  });

  host.on("topic_chosen", (data) => {
    console.log(`[Host] Topic chosen: "${data.topic}" by ${data.pickerUsername}\n`);
  });

  // Handle questions
  let questionCount = 0;

  const handleQuestion = (socket, playerName) => {
    socket.on("question_start", (data) => {
      questionCount++;
      console.log(`[${playerName}] Question ${questionCount}: ${data.text.substring(0, 40)}...`);
      setTimeout(() => {
        socket.emit("submit_answer", { answerIndex: 0, gameCode });
      }, 500);
    });
  };

  handleQuestion(player1, "Player1");
  handleQuestion(player2, "Player2");

  // Listen for round over
  host.on("round_over", (data) => {
    console.log(`\n[Host] ===== ROUND ${data.round}/${data.totalRounds} COMPLETE =====`);
    console.log(`[Host] Scores:`, data.scores.map(s => `${s.username}: ${s.score}`).join(", "));
    console.log(`[Host] Waiting 10s before next round...\n`);
  });

  // Listen for game over
  host.on("game_over", (data) => {
    console.log(`\n===== GAME OVER =====`);
    console.log(`Final Scores:`, data.scores.map(s => `${s.username}: ${s.score}`).join(", "));
    console.log(`\n✅ ROUND LIFECYCLE TEST COMPLETE!\n`);

    setTimeout(() => {
      host.disconnect();
      player1.disconnect();
      player2.disconnect();
      process.exit(0);
    }, 1000);
  });

  // Join players
  player1.emit("join_game", { username: "Alice", gameCode });
  await sleep(100);
  player2.emit("join_game", { username: "Bob", gameCode });

  console.log("✓ Players joined, game starting...\n");
}

test().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
