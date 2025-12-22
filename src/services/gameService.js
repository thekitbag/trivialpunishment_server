const { MOCK_QUESTIONS, QUESTION_TIME_MS, REVEAL_TIME_MS, ROUND_OVER_DELAY_MS } = require("../config");
const { dbRun, dbGet, dbAll } = require("../db");
const { generateRoundContent } = require("./openAIService");
const levenshtein = require("fast-levenshtein");

const activeSessions = new Map();

/**
 * Normalizes a string for answer comparison
 * @param {string} str - The string to normalize
 * @returns {string} Normalized string
 */
function normalizeAnswer(str) {
  if (!str) return '';

  let normalized = str.toLowerCase().trim();

  // Remove common articles from the start
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');

  // Remove punctuation
  normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Validates a user's text answer against accepted answers using fuzzy matching
 * @param {string} userInput - The user's typed answer
 * @param {string[]} acceptedAnswers - Array of acceptable answers
 * @returns {boolean} True if answer is correct
 */
function validateAnswer(userInput, acceptedAnswers) {
  if (!userInput || !acceptedAnswers || acceptedAnswers.length === 0) {
    return false;
  }

  const normalizedInput = normalizeAnswer(userInput);

  for (const acceptedAnswer of acceptedAnswers) {
    const normalizedAccepted = normalizeAnswer(acceptedAnswer);

    // Exact match after normalization
    if (normalizedInput === normalizedAccepted) {
      return true;
    }

    // Fuzzy match using Levenshtein distance
    const distance = levenshtein.get(normalizedInput, normalizedAccepted);
    let maxAllowedDistance = 0;

    if (normalizedAccepted.length <= 3) {
      maxAllowedDistance = 0; // Strict for short words
    } else if (normalizedAccepted.length <= 6) {
      maxAllowedDistance = 1; // 1 typo for medium words
    } else {
      maxAllowedDistance = 2; // 2 typos for long words
    }

    if (distance <= maxAllowedDistance) {
      return true;
    }
  }

  return false;
}

/**
 * Fisher-Yates shuffle to randomize array order
 * @param {Array} array - The array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function randomGameCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

// ... (in handleTopicSubmission)

  // Generate questions for this topic - AWAIT to ensure they're ready before starting questions
  try {
    console.log(`[GameService] Generating questions for topic "${topic}" with difficulty "${game.difficulty}"...`);
    const content = await generateRoundContent(topic, game.questions_per_round, game.difficulty);
    session.currentRoundQuestions = shuffleArray(content.questions);
    session.currentRoundTitle = content.punnyTitle;
    console.log(`[GameService] ✅ Round ready: "${content.punnyTitle}" with ${content.questions.length} questions`);
  } catch (error) {


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
      SELECT game_code, host_socket_id, game_state, max_players, rounds_per_player, questions_per_round, current_round, difficulty
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
      currentPickerUsername: null,
      currentRoundQuestions: [],
      currentRoundTitle: "",
      questionTimer: null,
      revealTimer: null,
      roundOverTimer: null,
      isRevealing: false,
      answers: new Map(),
      questionStartTime: null
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
  session.currentRoundQuestions = [];
  session.currentRoundTitle = "";

  const pickerIndex = session.currentPickerIndex % players.length;
  const picker = players[pickerIndex];
  session.currentPickerUsername = picker.username;
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

  // Generate questions for this topic - AWAIT to ensure they're ready before starting questions
  try {
    console.log(`[GameService] Generating questions for topic "${topic}" with difficulty "${game.difficulty}"...`);
    const content = await generateRoundContent(topic, game.questions_per_round, game.difficulty);
    session.currentRoundQuestions = shuffleArray(content.questions);
    session.currentRoundTitle = content.punnyTitle;
    console.log(`[GameService] ✅ Round ready: "${content.punnyTitle}" with ${content.questions.length} questions`);
  } catch (error) {
    console.error(`[GameService] ❌ Error generating content for topic "${topic}":`, error.message);
    // Fallback is already handled in openAIService, this is an extra safety catch
    session.currentRoundQuestions = [];
    session.currentRoundTitle = topic;
  }

  // Small delay to let players see the "topic chosen" screen before first question
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
  session.questionStartTime = Date.now();

  const questionsInRound = session.currentQuestionIndex - ((session.currentRound - 1) * game.questions_per_round);
  const questionNumInRound = questionsInRound + 1;

  // Use generated questions if available, otherwise fallback to mock questions
  let question;
  if (session.currentRoundQuestions && session.currentRoundQuestions.length > 0) {
    const indexInRound = questionNumInRound - 1;
    question = session.currentRoundQuestions[indexInRound];
  } else {
    // Fallback to mock questions if generation failed or hasn't completed
    question = MOCK_QUESTIONS[session.currentQuestionIndex % MOCK_QUESTIONS.length];
  }

  const timeLimitSeconds = Math.floor(QUESTION_TIME_MS / 1000);

  io.to(gameCode).emit("question_start", {
    type: question.type || 'multiple_choice',
    text: question.text,
    options: question.options,
    round: session.currentRound,
    totalRounds: game.rounds_per_player * players.length,
    questionNumber: questionNumInRound,
    questionsPerRound: game.questions_per_round,
    topic: session.currentTopic,
    pickerUsername: session.currentPickerUsername,
    punnyTitle: session.currentRoundTitle || session.currentTopic,
    timeLimit: timeLimitSeconds
  });

  session.questionTimer = setTimeout(() => {
    revealAnswer(gameCode, io);
  }, QUESTION_TIME_MS);
}

// ... revealAnswer and startRoundOver remain the same ...

async function revealAnswer(gameCode, io) {
  const session = activeSessions.get(gameCode);
  if (!session) return;

  // Check if reveal is already in progress using session flag (atomic check)
  if (session.isRevealing) return;
  session.isRevealing = true;

  const game = await getGame(gameCode);
  if (!game || game.game_state !== "QUESTION") {
    session.isRevealing = false;
    return;
  }

  // Set state to REVEAL immediately to prevent duplicate calls
  await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, ["REVEAL", gameCode]);

  if (session.questionTimer) {
    clearTimeout(session.questionTimer);
    session.questionTimer = null;
  }

  const questionsInRound = session.currentQuestionIndex - ((session.currentRound - 1) * game.questions_per_round);
  const questionNumInRound = questionsInRound + 1;

  // Use generated questions if available, otherwise fallback to mock questions
  let question;
  if (session.currentRoundQuestions && session.currentRoundQuestions.length > 0) {
    const indexInRound = questionNumInRound - 1;
    question = session.currentRoundQuestions[indexInRound];
  } else {
    question = MOCK_QUESTIONS[session.currentQuestionIndex % MOCK_QUESTIONS.length];
  }

  const players = await getPlayersForGame(gameCode);

  // Track points earned by each player for this question
  const pointsEarned = {};

  // Determine question type (default to multiple_choice for backward compatibility)
  const questionType = question.type || 'multiple_choice';

  for (const player of players) {
    const answerData = session.answers.get(player.id);
    let isCorrect = false;

    // Check if answer is correct based on question type
    if (questionType === 'multiple_choice') {
      isCorrect = answerData && answerData.answerIndex === question.correct;
    } else if (questionType === 'free_text') {
      isCorrect = answerData && answerData.answerText &&
                  validateAnswer(answerData.answerText, question.acceptedAnswers);
    }

    if (isCorrect) {
      // Calculate time-based points
      // Instant answer (0ms) = 100 points
      // Answer at time limit (QUESTION_TIME_MS) = 10 points
      // Linear interpolation in between
      const timeElapsed = answerData.timestamp - session.questionStartTime;
      const timeRatio = Math.min(timeElapsed / QUESTION_TIME_MS, 1); // Clamp to max 1
      const points = Math.round(100 - (timeRatio * 90));
      const finalPoints = Math.max(10, Math.min(100, points)); // Ensure between 10 and 100

      await dbRun(`UPDATE players SET score = score + ? WHERE id = ?`, [finalPoints, player.id]);
      pointsEarned[player.id] = finalPoints;
    } else {
      // Player answered incorrectly or didn't answer
      pointsEarned[player.id] = 0;
    }
  }

  const updatedPlayers = await getPlayersForGame(gameCode);
  const scores = updatedPlayers.map((p) => ({
    id: p.id,
    username: p.username,
    score: p.score
  }));

  // Extract the correct answer text based on question type
  let correctAnswerText;
  if (questionType === 'multiple_choice') {
    correctAnswerText = question.options[question.correct];
  } else if (questionType === 'free_text') {
    correctAnswerText = question.correctAnswerDisplay;
  }

  io.to(gameCode).emit("round_reveal", {
    correctIndex: questionType === 'multiple_choice' ? question.correct : undefined,
    correctAnswerText: correctAnswerText,
    scores,
    pointsEarned
  });

  session.currentQuestionIndex++;

  const questionsCompletedInRound = session.currentQuestionIndex - ((session.currentRound - 1) * game.questions_per_round);

  if (session.revealTimer) {
    clearTimeout(session.revealTimer);
    session.revealTimer = null;
  }

  if (questionsCompletedInRound >= game.questions_per_round) {
    session.revealTimer = setTimeout(() => {
      startRoundOver(gameCode, io);
    }, REVEAL_TIME_MS);
  } else {
    session.revealTimer = setTimeout(() => {
      startQuestion(gameCode, io);
    }, REVEAL_TIME_MS);
  }

  // Reset flag after setting up next timer
  session.isRevealing = false;
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
    user_id: p.id, // Note: This is player ID, not user ID from auth. We need user_id from auth.
    username: p.username,
    score: p.score
  })).sort((a, b) => b.score - a.score);

  // Insert into game_history
  await dbRun(`INSERT INTO game_history (game_code) VALUES (?)`, [gameCode]);
  const historyRow = await dbGet(`SELECT id FROM game_history WHERE game_code = ? ORDER BY id DESC LIMIT 1`, [gameCode]);
  
  if (historyRow) {
    const historyId = historyRow.id;
    // We need to fetch real user_ids for history
    const playersWithUserIds = await dbAll(`SELECT username, score, user_id FROM players WHERE game_code = ?`, [gameCode]);
    const sortedPlayers = playersWithUserIds.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < sortedPlayers.length; i++) {
      const p = sortedPlayers[i];
      await dbRun(
        `INSERT INTO game_history_players (game_history_id, user_id, username, score, rank) VALUES (?, ?, ?, ?, ?)`,
        [historyId, p.user_id, p.username, p.score, i + 1]
      );
    }
  }

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
