const io = require("socket.io-client");

const SERVER_URL = "http://localhost:3001";
const QUESTION_TIME_MS = 30000; // 30 seconds

async function test() {
  console.log("Testing time-based scoring...\n");

  const host = io(SERVER_URL);
  const fastPlayer = io(SERVER_URL);
  const slowPlayer = io(SERVER_URL);
  const wrongPlayer = io(SERVER_URL);

  await Promise.all([
    new Promise(resolve => host.on("connect", resolve)),
    new Promise(resolve => fastPlayer.on("connect", resolve)),
    new Promise(resolve => slowPlayer.on("connect", resolve)),
    new Promise(resolve => wrongPlayer.on("connect", resolve))
  ]);

  console.log("All sockets connected\n");

  let gameCode;
  let correctAnswer;

  host.emit("create_game", { maxPlayers: 3, roundsPerPlayer: 1, questionsPerRound: 1 });

  await new Promise(resolve => {
    host.on("game_created", (data) => {
      gameCode = data.gameCode;
      console.log(`Game created: ${gameCode}\n`);
      resolve();
    });
  });

  host.on("topic_request", () => {
    console.log("[Host] Received topic request");
    host.emit("submit_topic", { gameCode, topic: "Science" });
  });

  // Track when question starts
  let questionStartTime;
  host.on("question_start", (data) => {
    questionStartTime = Date.now();
    correctAnswer = data.options[data.options.findIndex((opt, idx) => {
      // We don't know the correct answer from the client side
      // So we'll just pick option 0 for fast and slow players
      return true;
    })];
    console.log(`[Host] Question started: ${data.text}`);
    console.log(`[Host] Options:`, data.options);
  });

  // Fast player answers almost immediately
  fastPlayer.on("question_start", async (data) => {
    console.log(`[FastPlayer] Received question`);
    const elapsedMs = Date.now() - questionStartTime;
    console.log(`[FastPlayer] Answering after ${elapsedMs}ms (should get ~100 points)`);

    // Answer with index 0 immediately
    fastPlayer.emit("submit_answer", { answerIndex: 0, gameCode });
  });

  // Slow player waits before answering
  slowPlayer.on("question_start", async (data) => {
    console.log(`[SlowPlayer] Received question`);

    // Wait 25 seconds before answering (close to the time limit)
    setTimeout(() => {
      const elapsedMs = Date.now() - questionStartTime;
      console.log(`[SlowPlayer] Answering after ${elapsedMs}ms (should get ~25 points)`);
      slowPlayer.emit("submit_answer", { answerIndex: 0, gameCode });
    }, 25000);
  });

  // Wrong player answers with wrong answer
  wrongPlayer.on("question_start", async (data) => {
    console.log(`[WrongPlayer] Received question`);
    console.log(`[WrongPlayer] Answering incorrectly (should get 0 points)`);

    // Answer with wrong index
    wrongPlayer.emit("submit_answer", { answerIndex: 1, gameCode });
  });

  host.on("round_reveal", (data) => {
    console.log("\n[Host] Round reveal:");
    console.log(`Correct answer index: ${data.correctIndex}`);
    console.log("Scores:");
    data.scores.forEach(s => {
      console.log(`  ${s.username}: ${s.score} points`);
    });
    console.log();
  });

  host.on("game_over", (data) => {
    console.log("\n[Host] Game Over! Final scores:");
    data.scores.forEach(s => {
      console.log(`  ${s.username}: ${s.score} points`);
    });

    // Verify the scoring
    const fast = data.scores.find(s => s.username === "FastPlayer");
    const slow = data.scores.find(s => s.username === "SlowPlayer");
    const wrong = data.scores.find(s => s.username === "WrongPlayer");

    console.log("\n--- Verification ---");
    console.log(`FastPlayer score: ${fast?.score || 0} (expected: ~95-100)`);
    console.log(`SlowPlayer score: ${slow?.score || 0} (expected: ~25)`);
    console.log(`WrongPlayer score: ${wrong?.score || 0} (expected: 0)`);

    const fastCorrect = fast && fast.score >= 90 && fast.score <= 100;
    const slowCorrect = slow && slow.score >= 20 && slow.score <= 30;
    const wrongCorrect = wrong && wrong.score === 0;

    if (fastCorrect && slowCorrect && wrongCorrect) {
      console.log("\n✅ TEST PASSED: Time-based scoring works correctly!");
    } else {
      console.log("\n❌ TEST FAILED: Scoring doesn't match expected values");
    }

    setTimeout(() => {
      host.disconnect();
      fastPlayer.disconnect();
      slowPlayer.disconnect();
      wrongPlayer.disconnect();
      process.exit(fastCorrect && slowCorrect && wrongCorrect ? 0 : 1);
    }, 500);
  });

  // Handle errors
  [host, fastPlayer, slowPlayer, wrongPlayer].forEach((socket, idx) => {
    const name = ["Host", "FastPlayer", "SlowPlayer", "WrongPlayer"][idx];
    socket.on("error", (msg) => {
      console.log(`[${name}] ERROR:`, msg);
    });
  });

  // Join the game
  fastPlayer.emit("join_game", { username: "FastPlayer", gameCode });
  slowPlayer.emit("join_game", { username: "SlowPlayer", gameCode });
  wrongPlayer.emit("join_game", { username: "WrongPlayer", gameCode });

  console.log("Players joining...\n");
}

test().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
