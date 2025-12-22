const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, MOCK_QUESTIONS, QUESTION_TIME_MS, STARTING_DELAY_MS } = require("../config");
const { dbRun, dbGet, dbAll } = require("../db");
const gameService = require("../services/gameService");

function createSocketServer(httpServer) {
  const ioServer = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  // Logging wrapper for room emissions
  const io = {
    ...ioServer,
    to: (room) => {
      const originalEmit = ioServer.to(room).emit.bind(ioServer.to(room));
      return {
        emit: (event, ...args) => {
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] [WS->Client] Room: ${room}, Event: ${event}, Data:`, JSON.stringify(args));
          return originalEmit(event, ...args);
        }
      };
    },
    use: ioServer.use.bind(ioServer),
    on: ioServer.on.bind(ioServer)
  };

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      socket.user = { id: null, username: "Guest", isGuest: true };
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = { id: decoded.id, username: decoded.username, isGuest: false };
      next();
    } catch (err) {
      console.error("[socket auth] invalid token:", err.message);
      socket.user = { id: null, username: "Guest", isGuest: true };
      next();
    }
  });

  async function emitPlayerListToRoom(gameCode) {
    const players = await gameService.getPlayersForGame(gameCode);
    io.to(gameCode).emit("update_player_list", players);
  }

  io.on("connection", (socket) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [WS] Socket connected: ${socket.id} (user: ${socket.user.username})`);

    // Logging wrapper for socket events
    const originalOn = socket.on.bind(socket);
    const originalEmit = socket.emit.bind(socket);

    socket.on = (event, handler) => {
      return originalOn(event, async (...args) => {
        const ts = new Date().toISOString();
        console.log(`[${ts}] [WS<-Client] Socket: ${socket.id}, Event: ${event}, Data:`, JSON.stringify(args));
        return handler(...args);
      });
    };

    socket.emit = (event, ...args) => {
      const ts = new Date().toISOString();
      console.log(`[${ts}] [WS->Client] Socket: ${socket.id}, Event: ${event}, Data:`, JSON.stringify(args));
      return originalEmit(event, ...args);
    };

    socket.on("create_game", async (payload) => {
      try {
        const maxPlayers = gameService.clampInt(payload?.maxPlayers, 2, 8, 3);
        const roundsPerPlayer = gameService.clampInt(payload?.roundsPerPlayer, 1, 5, 2);
        const questionsPerRound = gameService.clampInt(payload?.questionsPerRound, 3, 10, 5);

        // Validate difficulty setting
        const allowedDifficulties = ['Easy', 'Medium', 'Hard', 'Mixed'];
        const difficulty = allowedDifficulties.includes(payload?.difficulty)
          ? payload.difficulty
          : 'Mixed';

        const gameCode = await gameService.generateUniqueGameCode();

        await dbRun(
          `
            INSERT INTO games (
              game_code,
              host_socket_id,
              game_state,
              max_players,
              rounds_per_player,
              questions_per_round,
              current_round,
              difficulty
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [gameCode, socket.id, "LOBBY", maxPlayers, roundsPerPlayer, questionsPerRound, 0, difficulty]
        );

        socket.join(gameCode);
        socket.emit("game_created", {
          gameCode,
          maxPlayers,
          roundsPerPlayer,
          questionsPerRound,
          difficulty
        });
        await emitPlayerListToRoom(gameCode);
      } catch (err) {
        console.error("[create_game] failed", err);
        socket.emit("error", "Unable to create game");
      }
    });

    socket.on("join_game", async (payload) => {
      try {
        const username = payload && typeof payload.username === "string" ? payload.username : "";
        const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";

        const normalizedUsername = username.trim();
        const gameCode = gameCodeRaw.trim().toUpperCase();
        if (!normalizedUsername || gameCode.length !== 4) {
          socket.emit("error", "Invalid join payload");
          return;
        }

        const game = await gameService.getGame(gameCode);
        if (!game) {
          socket.emit("error", "Game not found");
          return;
        }

        socket.join(gameCode);

        let existingPlayer = null;
        if (socket.user && !socket.user.isGuest && socket.user.id) {
          existingPlayer = await dbGet(
            `SELECT id FROM players WHERE game_code = ? AND user_id = ? LIMIT 1`,
            [gameCode, socket.user.id]
          );
        }

        if (!existingPlayer) {
          existingPlayer = await dbGet(
            `SELECT id FROM players WHERE game_code = ? AND username = ? LIMIT 1`,
            [gameCode, normalizedUsername]
          );
        }

        const playerCountRow = await dbGet(`SELECT COUNT(*) AS count FROM players WHERE game_code = ?`, [
          gameCode
        ]);
        const playerCount = Number(playerCountRow?.count) || 0;
        const maxPlayers = Number(game.max_players) || 3;

        if (!existingPlayer && playerCount >= maxPlayers) {
          socket.emit("error", "Room Full");
          socket.leave(gameCode);
          return;
        }

        if (!existingPlayer && game.game_state && game.game_state !== "LOBBY") {
          socket.emit("error", "Game already started");
          socket.leave(gameCode);
          return;
        }

        if (existingPlayer) {
          const userIdToUpdate = (socket.user && !socket.user.isGuest) ? socket.user.id : null;
          if (userIdToUpdate) {
            await dbRun(`UPDATE players SET socket_id = ?, user_id = ? WHERE id = ?`, [socket.id, userIdToUpdate, existingPlayer.id]);
          } else {
            await dbRun(`UPDATE players SET socket_id = ? WHERE id = ?`, [socket.id, existingPlayer.id]);
          }
        } else {
          const userIdToInsert = (socket.user && !socket.user.isGuest) ? socket.user.id : null;
          await dbRun(
            `INSERT INTO players (socket_id, game_code, username, score, is_host, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [socket.id, gameCode, normalizedUsername, 0, 0, userIdToInsert]
          );
        }

        const updatedCountRow = await dbGet(`SELECT COUNT(*) AS count FROM players WHERE game_code = ?`, [
          gameCode
        ]);
        const updatedCount = Number(updatedCountRow?.count) || 0;

        if (game.game_state === "LOBBY" && updatedCount === maxPlayers) {
          await dbRun(`UPDATE games SET game_state = ? WHERE game_code = ?`, ["STARTING", gameCode]);
          io.to(gameCode).emit("game_started");

          setTimeout(() => {
            gameService.startTopicSelection(gameCode, io);
          }, STARTING_DELAY_MS);
        } else if (existingPlayer && game.game_state !== "LOBBY") {
          socket.emit("game_started");

          if (game.game_state === "QUESTION") {
            const session = gameService.activeSessions.get(gameCode);
            if (session) {
              const currentPlayers = await gameService.getPlayersForGame(gameCode);
              const totalRounds = game.rounds_per_player * currentPlayers.length;
              const question = MOCK_QUESTIONS[session.currentQuestionIndex % MOCK_QUESTIONS.length];
              const timeLimitSeconds = Math.floor(QUESTION_TIME_MS / 1000);

              socket.emit("question_start", {
                text: question.text,
                options: question.options,
                round: session.currentQuestionIndex + 1,
                totalRounds: totalRounds,
                timeLimit: timeLimitSeconds
              });
            }
          }
        }

        await emitPlayerListToRoom(gameCode);
      } catch (err) {
        console.error("[join_game] failed", err);
        socket.emit("error", "Unable to join game");
      }
    });

    socket.on("reconnect_host", async (payload) => {
      try {
        const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";
        const gameCode = gameCodeRaw.trim().toUpperCase();
        if (gameCode.length !== 4) {
          socket.emit("error", "Invalid game code");
          return;
        }

        const game = await gameService.getGame(gameCode);
        if (!game) {
          socket.emit("error", "Game not found");
          return;
        }

        await dbRun(`UPDATE games SET host_socket_id = ? WHERE game_code = ?`, [socket.id, gameCode]);
        socket.join(gameCode);

        socket.emit("host_reconnected", {
          gameCode,
          gameState: game.game_state,
          maxPlayers: game.max_players,
          roundsPerPlayer: game.rounds_per_player,
          questionsPerRound: game.questions_per_round,
          currentRound: game.current_round
        });

        await emitPlayerListToRoom(gameCode);
      } catch (err) {
        console.error("[reconnect_host] failed", err);
        socket.emit("error", "Unable to reconnect host");
      }
    });

    socket.on("request_player_list", async (payload) => {
      try {
        const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";
        const gameCode = gameCodeRaw.trim().toUpperCase();
        if (gameCode.length !== 4) {
          socket.emit("error", "Invalid game code");
          return;
        }

        const players = await gameService.getPlayersForGame(gameCode);
        socket.emit("update_player_list", players);
      } catch (err) {
        console.error("[request_player_list] failed", err);
        socket.emit("error", "Unable to fetch player list");
      }
    });

    socket.on("submit_topic", async (payload) => {
      try {
        const topic = payload && typeof payload.topic === "string" ? payload.topic : "";
        const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";
        const gameCode = gameCodeRaw.trim().toUpperCase();

        if (!topic || topic.trim().length === 0 || !gameCode) {
          socket.emit("error", "Invalid topic payload");
          return;
        }

        const result = await gameService.handleTopicSubmission(gameCode, topic.trim(), socket.id, io);

        if (!result.success) {
          socket.emit("error", result.error);
        }
      } catch (err) {
        console.error("[submit_topic] failed", err);
        socket.emit("error", "Unable to submit topic");
      }
    });

    socket.on("submit_answer", async (payload) => {
      try {
        const gameCodeRaw = payload && typeof payload.gameCode === "string" ? payload.gameCode : "";
        const gameCode = gameCodeRaw.trim().toUpperCase();

        if (!gameCode) {
          socket.emit("error", "Invalid answer payload");
          return;
        }

        // Accept either answerIndex (for multiple choice) or answer (for free text)
        const answerIndex = payload && typeof payload.answerIndex === "number" ? payload.answerIndex : null;
        const answerText = payload && typeof payload.answer === "string" ? payload.answer : null;

        // Must have either answerIndex or answerText
        if (answerIndex === null && answerText === null) {
          socket.emit("error", "Invalid answer payload: must provide answerIndex or answer");
          return;
        }

        // Validate answerIndex range if provided
        if (answerIndex !== null && (answerIndex < 0 || answerIndex > 3)) {
          socket.emit("error", "Invalid answer index");
          return;
        }

        const game = await gameService.getGame(gameCode);
        if (!game || game.game_state !== "QUESTION") {
          socket.emit("error", "Not accepting answers at this time");
          return;
        }

        const session = gameService.activeSessions.get(gameCode);
        if (!session) {
          socket.emit("error", "Game session not found");
          return;
        }

        const playerEntry = await dbGet(`SELECT id, username FROM players WHERE socket_id = ?`, [socket.id]);
        if (!playerEntry) {
          socket.emit("error", "Player not found in game session");
          return;
        }

        if (session.answers.has(playerEntry.id)) {
          return;
        }

        // Store the answer with appropriate field
        const answerData = {
          timestamp: Date.now()
        };

        if (answerIndex !== null) {
          answerData.answerIndex = answerIndex;
        }

        if (answerText !== null) {
          answerData.answerText = answerText;
        }

        session.answers.set(playerEntry.id, answerData);

        const hostSocket = await dbGet(`SELECT host_socket_id FROM games WHERE game_code = ?`, [gameCode]);

        if (hostSocket && hostSocket.host_socket_id) {
          io.to(hostSocket.host_socket_id).emit("player_answered", {
            playerId: playerEntry.id,
            username: playerEntry?.username
          });
        }

        await gameService.checkAllAnswered(gameCode, io);
      } catch (err) {
        console.error("[submit_answer] failed", err);
        socket.emit("error", "Unable to submit answer");
      }
    });

    socket.on("disconnect", async (reason) => {
      const ts = new Date().toISOString();
      console.log(`[${ts}] [WS] Socket disconnected: ${socket.id} (reason: ${reason})`);
      try {
        const affectedGames = await dbAll(
          `SELECT DISTINCT game_code FROM players WHERE socket_id = ?`,
          [socket.id]
        );

        await dbRun(`UPDATE players SET socket_id = NULL WHERE socket_id = ?`, [socket.id]);
        await dbRun(`UPDATE games SET host_socket_id = NULL WHERE host_socket_id = ?`, [socket.id]);

        await Promise.all(
          affectedGames
            .map((row) => row.game_code)
            .filter(Boolean)
            .map((gameCode) => emitPlayerListToRoom(gameCode))
        );
      } catch (err) {
        console.error("[disconnect] cleanup failed", err);
      }
    });
  });

  return io;
}

module.exports = createSocketServer;
