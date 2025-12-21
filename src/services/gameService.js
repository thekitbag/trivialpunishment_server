const { MOCK_QUESTIONS, QUESTION_TIME_MS, REVEAL_TIME_MS, ROUND_OVER_DELAY_MS } = require("../config");
const { dbRun, dbGet, dbAll } = require("../db");

const activeSessions = new Map();

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
      SELECT id, socket_id, username, score, is_host
      FROM players
      WHERE game_code = ? AND socket_id IS NOT NULL
      ORDER BY id ASC
    `,
    [gameCode]
  );

  return rows.map((row) => ({
    id: row.id,
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

function getOrCreateSession(gameCode) {
  if (!activeSessions.has(gameCode)) {
    activeSessions.set(gameCode, {
      currentQuestionIndex: 0,
      currentRound: 0,
      currentPickerIndex: 0,
      currentTopic: null,
      questionTimer: null,
      revealTimer: null,
      roundOverTimer: null,
      answers: new Map()
    });
  }
  return activeSessions.get(gameCode);
}

function clearSessionTimers(gameCode) {
  const session = activeSessions.get(gameCode);
  if (session) {
    if (session.questionTimer) clearTimeout(session.questionTimer);
    if (session.revealTimer) clearTimeout(session.revealTimer);
    if (session.roundOverTimer) clearTimeout(session.roundOverTimer);
  }
}

async function startTopicSelection(gameCode, io) {
  const game = await getGame(gameCode);
  if (!game) return;

  const session = getOrCreateSession(gameCode);
  const players = await getPlayersForGame(gameCode);

  if (players.length === 0) return;

  const totalRounds = game.rounds_per_player * players.length;

  if (session.currentRound >= totalRounds) {
    await endGame(gameCode, io);
    return;
  }

  session.currentRound++;
  session.currentQuestionIndex = (session.currentRound - 1) * game.questions_per_round;
  session.currentTopic = null;

  const pickerIndex = session.currentPickerIndex % players.length;
  const picker = players[pickerIndex];
  session.currentPickerIndex++;

  await dbRun(`UPDATE games SET game_state = ?, current_round = ? WHERE game_code = ?`, [
    "TOPIC_SELECTION",
    session.currentRound,
    gameCode
  ]);

  const pickerSocket = await dbGet(`SELECT socket_id FROM players WHERE id = ?`, [picker.id]);

  if (pickerSocket && pickerSocket.socket_id) {
    io.to(pickerSocket.socket_id).emit("topic_request", {
      round: session.currentRound,
      totalRounds
    });
  }

  io.to(gameCode).emit("topic_waiting", {
    pickerUsername: picker.username,
    round: session.currentRound,
    totalRounds
  });
}

async function handleTopicSubmission(gameCode, topic, submitterSocketId, io) {
  const session = activeSessions.get(gameCode);
  if (!session) return { success: false, error: "Game session not found" };

  const game = await getGame(gameCode);
  if (!game || game.game_state !== "TOPIC_SELECTION") {
    return { success: false, error: "Not in topic selection phase" };
  }

  const players = await getPlayersForGame(gameCode);
  const currentPickerIndex = (session.currentPickerIndex - 1) % players.length;
  const expectedPicker = players[currentPickerIndex];

  const submitter = await dbGet(`SELECT id FROM players WHERE socket_id = ?`, [submitterSocketId]);

  if (!submitter || submitter.id !== expectedPicker.id) {
    return { success: false, error: "You are not the topic picker" };
  }

  session.currentTopic = topic;

  io.to(gameCode).emit("topic_chosen", {
    topic,
    pickerUsername: expectedPicker.username
  });

  setTimeout(() => {
    startQuestion(gameCode, io);
  }, 2000);

  return { success: true };
}

async function startQuestion(gameCode, io) {
  const game = await getGame(gameCode);
  if (!game) return;

  const session = getOrCreateSession(gameCode);
  const players = await getPlayersForGame(gameCode);

  await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, [
    "QUESTION",
    gameCode
  ]);

  session.answers.clear();

  const question = MOCK_QUESTIONS[session.currentQuestionIndex % MOCK_QUESTIONS.length];
  const timeLimitSeconds = Math.floor(QUESTION_TIME_MS / 1000);
  const questionsInRound = session.currentQuestionIndex - ((session.currentRound - 1) * game.questions_per_round);
  const questionNumInRound = questionsInRound + 1;

  io.to(gameCode).emit("question_start", {
    text: question.text,
    options: question.options,
    round: session.currentRound,
    totalRounds: game.rounds_per_player * players.length,
    questionNumber: questionNumInRound,
    questionsPerRound: game.questions_per_round,
    topic: session.currentTopic,
    timeLimit: timeLimitSeconds
  });

  session.questionTimer = setTimeout(() => {
    revealAnswer(gameCode, io);
  }, QUESTION_TIME_MS);
}

async function revealAnswer(gameCode, io) {
  const session = activeSessions.get(gameCode);
  if (!session) return;

  const game = await getGame(gameCode);
  if (!game || game.game_state !== "QUESTION") return;

  if (session.questionTimer) {
    clearTimeout(session.questionTimer);
    session.questionTimer = null;
  }

  const question = MOCK_QUESTIONS[session.currentQuestionIndex % MOCK_QUESTIONS.length];
  const players = await getPlayersForGame(gameCode);

  for (const player of players) {
    const answer = session.answers.get(player.id);
    if (answer !== undefined && answer === question.correct) {
      await dbRun(`UPDATE players SET score = score + 100 WHERE id = ?`, [player.id]);
    }
  }

  const updatedPlayers = await getPlayersForGame(gameCode);
  const scores = updatedPlayers.map((p) => ({
    id: p.id,
    username: p.username,
    score: p.score
  }));

  await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, ["REVEAL", gameCode]);

  io.to(gameCode).emit("round_reveal", {
    correctIndex: question.correct,
    scores
  });

  session.currentQuestionIndex++;

  const questionsInRound = session.currentQuestionIndex - ((session.currentRound - 1) * game.questions_per_round);

  if (session.revealTimer) {
    clearTimeout(session.revealTimer);
    session.revealTimer = null;
  }

  if (questionsInRound >= game.questions_per_round) {
    session.revealTimer = setTimeout(() => {
      startRoundOver(gameCode, io);
    }, REVEAL_TIME_MS);
  } else {
    session.revealTimer = setTimeout(() => {
      startQuestion(gameCode, io);
    }, REVEAL_TIME_MS);
  }
}

async function startRoundOver(gameCode, io) {
  const session = activeSessions.get(gameCode);
  if (!session) return;

  const game = await getGame(gameCode);
  if (!game) return;

  await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, ["ROUND_OVER", gameCode]);

  const players = await getPlayersForGame(gameCode);
  const scores = players.map((p) => ({
    id: p.id,
    username: p.username,
    score: p.score
  })).sort((a, b) => b.score - a.score);

  io.to(gameCode).emit("round_over", {
    scores,
    round: session.currentRound,
    totalRounds: game.rounds_per_player * players.length
  });

  const totalRounds = game.rounds_per_player * players.length;

  session.roundOverTimer = setTimeout(() => {
    if (session.currentRound >= totalRounds) {
      endGame(gameCode, io);
    } else {
      startTopicSelection(gameCode, io);
    }
  }, ROUND_OVER_DELAY_MS);
}

async function endGame(gameCode, io) {
  const session = activeSessions.get(gameCode);
  if (session) {
    clearSessionTimers(gameCode);
  }

  await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, ["GAME_OVER", gameCode]);

  const players = await getPlayersForGame(gameCode);
  const finalScores = players.map((p) => ({
    id: p.id,
    username: p.username,
    score: p.score
  })).sort((a, b) => b.score - a.score);

  io.to(gameCode).emit("game_over", { scores: finalScores });

  await dbRun(`DELETE FROM players WHERE game_code = ?`, [gameCode]);

  activeSessions.delete(gameCode);
}

async function checkAllAnswered(gameCode, io) {
  const session = activeSessions.get(gameCode);
  if (!session) return;

  const players = await getPlayersForGame(gameCode);
  const allAnswered = players.every((p) => session.answers.has(p.id));

  if (allAnswered) {
    if (session.questionTimer) {
      clearTimeout(session.questionTimer);
      session.questionTimer = null;
    }
    revealAnswer(gameCode, io);
  }
}

module.exports = {
  activeSessions,
  generateUniqueGameCode,
  getPlayersForGame,
  clampInt,
  getGame,
  getOrCreateSession,
  startTopicSelection,
  handleTopicSubmission,
  startQuestion,
  revealAnswer,
  startRoundOver,
  endGame,
  checkAllAnswered
};
