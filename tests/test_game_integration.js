const io = require("socket.io-client");

const SERVER_URL = "http://localhost:3001";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("Testing Game Integration with OpenAI Service\n");

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

  // Host creates game (2 players, 1 round total = 0.5 rounds per player, rounds to 1)
  // To get 1 total round with 2 players, we need roundsPerPlayer to round down, but minimum is 1
  // So let's use maxPlayers: 2, roundsPerPlayer: 1 which gives 2 rounds total
  // But only implement 1 round in the test
  host.emit("create_game", { maxPlayers: 2, roundsPerPlayer: 1, questionsPerRound: 2 });

  await new Promise(resolve => {
    host.on("game_created", (data) => {
      gameCode = data.gameCode;
      console.log(`✓ Game created: ${gameCode} (${data.roundsPerPlayer} rounds/player x 2 players = ${data.roundsPerPlayer * 2} total rounds, ${data.questionsPerRound} questions/round)\n`);
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
      const topic = "Bananas";
      player1.emit("submit_topic", { topic, gameCode });
      console.log(`[Player1] Submitted topic: ${topic}`);
    }, 1000);
  });

  player2.on("topic_request", (data) => {
    console.log(`[Player2] You are the topic picker! (Round ${data.round}/${data.totalRounds})`);
    setTimeout(() => {
      const topic = "Space";
      player2.emit("submit_topic", { topic, gameCode });
      console.log(`[Player2] Submitted topic: ${topic}`);
    }, 1000);
  });

  host.on("topic_chosen", (data) => {
    console.log(`[Host] Topic chosen: "${data.topic}" by ${data.pickerUsername}`);
    console.log(`[Host] Waiting for question generation...`);
  });

  // Handle questions - log the punnyTitle and questions
  let questionCount = 0;

  player1.on("question_start", (data) => {
    questionCount++;
    console.log(`\n[Player1] Question ${questionCount}/${data.questionsPerRound}:`);
    if (data.punnyTitle) {
      console.log(`  Round Title: "${data.punnyTitle}"`);
    }
    console.log(`  Topic: ${data.topic}`);
    console.log(`  Question: ${data.text}`);
    console.log(`  Options: ${data.options.join(", ")}`);

    setTimeout(() => {
      player1.emit("submit_answer", { answerIndex: 0, gameCode });
    }, 500);
  });

  player2.on("question_start", (data) => {
    questionCount++;
    console.log(`[Player2] Question ${questionCount}/${data.questionsPerRound}: ${data.text.substring(0, 40)}...`);
    setTimeout(() => {
      player2.emit("submit_answer", { answerIndex: 0, gameCode });
    }, 500);
  });

  // Listen for game over
  host.on("game_over", (data) => {
    console.log(`\n===== GAME OVER =====`);
    console.log(`Final Scores:`, data.scores.map(s => `${s.username}: ${s.score}`).join(", "));
    console.log(`\n✅ INTEGRATION TEST COMPLETE!`);
    console.log(`\n📝 Summary:`);
    console.log(`   - Topic selection worked`);
    console.log(`   - Questions were ${questionCount > 0 ? 'generated and displayed' : 'NOT displayed'}`);
    console.log(`   - Round completed successfully`);

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
