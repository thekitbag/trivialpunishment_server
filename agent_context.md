# Agent Context: Trivial Punishment Server

## Project Overview
**Trivial Punishment** is a local multiplayer, mobile-first web game. This repository is the **Backend Server**.
- **Role:** Orchestrates game state, manages connections, and persists data.
- **Stack:** Node.js, Express, Socket.io, SQLite3.

## Architecture
- **Entry Point:** `server.js` - Initializes database and starts HTTP/WebSocket servers.
- **Database:** `server/game_data.db` (SQLite).
- **Environment:** `.env` file (JWT_SECRET for token signing).
- **Modular Structure:**
  - `src/config.js` - Environment variables, constants, and mock questions.
  - `src/db/index.js` - Database connection, initialization, and helper functions (dbRun, dbGet, dbAll).
  - `src/services/authService.js` - Authentication logic (signup, login).
  - `src/services/gameService.js` - Core game logic (sessions, questions, scoring).
  - `src/socket/index.js` - Socket.io server creation and event handlers.
  - `src/app.js` - Express app setup with HTTP logging and auth routes.
- **Communication:**
  - **Socket.io:** Handles real-time events (`create_game`, `join_game`, `game_started`).
  - **Socket Auth Middleware:** Verifies JWT tokens from `socket.handshake.auth.token`, attaches `socket.user` object.
  - **REST API:** Express endpoints for user authentication (`/api/auth/signup`, `/api/auth/login`).

## Data Model (SQLite)
1.  **`users` Table:**
    - `id` (PK, AUTOINCREMENT).
    - `username` (UNIQUE, NOT NULL, stored in lowercase for case-insensitive auth).
    - `password_hash` (NOT NULL, bcrypt hashed with 10 rounds).
    - `created_at` (DATETIME, auto-timestamp).
2.  **`games` Table:**
    - `game_code` (PK, 4-char string).
    - `host_socket_id`, `game_state` ('LOBBY', 'STARTING', etc).
    - Config: `max_players`, `rounds_per_player`, `questions_per_round`.
3.  **`players` Table:**
    - `id` (PK), `socket_id`, `username`.
    - `game_code` (FK to games).
    - `user_id` (FK to users, nullable - links game participation to permanent user accounts).
    - `is_host` (Boolean).

## Key Logic
- **Authentication:**
  - **Signup (POST /api/auth/signup):** Validates input, checks for duplicate usernames (case-insensitive), hashes password with bcrypt, creates user, returns JWT (7-day expiry).
  - **Login (POST /api/auth/login):** Validates credentials (case-insensitive username), compares password hash, returns JWT.
  - **Socket Auth:** Middleware verifies JWT from `socket.handshake.auth.token`, attaches `socket.user = { id, username, isGuest }` (falls back to Guest if no/invalid token).
- **Game Lifecycle:**
  - **Creation:** Generates unique code, stores config in DB.
  - **Lobby:** Broadcast `update_player_list` on joins.
  - **Auto-Start:** When `player_count === max_players`, transitions to `STARTING`, emits `game_started`, waits 3s, then starts first question.
  - **Question Phase (QUESTION state):**
    - Selects question from mock data, emits `question_start` with text, options, round number.
    - Starts 30s timer for answers.
    - Listens for `submit_answer` events, stores answers in memory, emits `player_answered` to host.
    - If all players answer, immediately transitions to REVEAL.
  - **Reveal Phase (REVEAL state):**
    - Calculates scores (+100 for correct answers).
    - Updates player scores in DB.
    - Emits `round_reveal` with correct answer and updated scores.
    - Waits 5s, then starts next question OR transitions to GAME_OVER.
  - **Game Over (GAME_OVER state):**
    - Emits `game_over` with final sorted scores.
    - Deletes all player records from the database for this game (allows players to join new games).
    - Cleans up in-memory session data.
- **Resilience:**
  - **Reconnection:** Handles `reconnect_host` by updating `host_socket_id` and sending back state.
  - **Cleanup:** On disconnect, sets `socket_id` to NULL but keeps data (allows rejoin).
  - **Timer Management:** All timers stored in `activeSessions` Map, properly cleared on state transitions.

## Module Responsibilities

### `server.js` (Entry Point - 24 lines)
- Initialize database and ensure schema updates.
- Create HTTP server.
- Initialize Socket.io with the HTTP server.
- Start listening on configured PORT.

### `src/config.js`
- Export all environment variables (PORT, JWT_SECRET, DB paths).
- Define game constants (QUESTION_TIME_MS, REVEAL_TIME_MS, STARTING_DELAY_MS).
- Store MOCK_QUESTIONS array.

### `src/db/index.js`
- Manage SQLite connection.
- Export `dbRun`, `dbGet`, `dbAll` promise wrappers.
- Handle table creation and schema migrations.
- Functions: `initDb`, `ensureGamesColumns`, `ensurePlayersColumns`.

### `src/services/authService.js`
- Export `signup(username, password)` - Returns { token, user }.
- Export `login(username, password)` - Returns { token, user }.
- All password hashing and JWT generation logic.

### `src/services/gameService.js`
- Export `activeSessions` Map for in-memory game state.
- Export game helper functions: `generateUniqueGameCode`, `getPlayersForGame`, `getGame`, `clampInt`.
- Export state machine functions: `startQuestion`, `revealAnswer`, `endGame`, `checkAllAnswered`.
- All functions accept `io` parameter when they need to emit events.

### `src/socket/index.js`
- Export `createSocketServer(httpServer)` function.
- Set up JWT authentication middleware.
- Register all socket event handlers.
- Wrap socket emissions with logging.

### `src/app.js`
- Export Express app instance.
- Configure CORS and JSON parsing.
- Add HTTP request logging middleware.
- Define auth routes: `POST /api/auth/signup`, `POST /api/auth/login`.

## Development Guidelines
- **Database:** Use the `dbRun`, `dbGet`, `dbAll` wrappers (Promises) for all SQL ops (imported from `src/db`).
- **Sockets:** Ensure all handlers are `async` and wrapped in `try/catch` to prevent crashes.
- **Security:**
  - NEVER store plain-text passwords (always use bcrypt).
  - Usernames are case-insensitive (stored lowercase, compared with `LOWER()`).
  - Use parameterized queries to prevent SQL injection.
  - JWT_SECRET loaded from `.env` (falls back to dev secret if missing).
- **Ports:** Defaults to 3001 (configurable via `PORT`).
- **Code Organization:**
  - Business logic goes in `src/services/`.
  - Database operations in `src/db/`.
  - Socket event handlers in `src/socket/`.
  - HTTP routes in `src/app.js`.
  - Configuration and constants in `src/config.js`.
- **Adding New Features:**
  - New game logic → Add to `src/services/gameService.js`.
  - New auth methods → Add to `src/services/authService.js`.
  - New socket events → Add handler in `src/socket/index.js`.
  - New HTTP endpoints → Add route in `src/app.js`.
  - New constants → Add to `src/config.js`.

## Socket Events
- **Client -> Server:**
  - `create_game` - Creates new game with config
  - `join_game` - Player joins game
  - `reconnect_host` - Host reconnects to existing game
  - `submit_answer` - Player submits answer during QUESTION phase
  - `request_player_list` - Request current player list
- **Server -> Client:**
  - `game_created` - Game successfully created
  - `game_started` - Game transitioning from LOBBY to STARTING
  - `question_start` - New question begins (text, options, round number)
  - `player_answered` - Emitted to host when player submits answer
  - `round_reveal` - Question results (correct answer, updated scores)
  - `game_over` - Final results (sorted scores)
  - `update_player_list` - Current players in game
  - `error` - Error message

## Current Status
- **Phase:** Modularization Refactor Complete.
- **Architecture:** Successfully refactored from monolithic 800+ line `server.js` to modular structure.
- **Implemented:**
  - **Authentication System:**
    - Users table with bcrypt password hashing.
    - JWT-based authentication (signup/login endpoints).
    - Socket.io authentication middleware.
    - Case-insensitive username handling.
  - **Game Engine:**
    - Complete game state machine (LOBBY -> STARTING -> QUESTION -> REVEAL -> GAME_OVER).
    - Mock question data source (5 questions in `src/config.js`).
    - Answer submission and validation.
    - Automatic scoring (+100 per correct answer).
    - Timer-based question progression (30s question, 5s reveal, 3s starting delay).
    - Early reveal when all players answer.
    - In-memory session management with proper cleanup.
    - Player cleanup on game over (allows rejoining new games).
    - Question timer payload (`timeLimit` field in `question_start` event).
  - **Infrastructure:**
    - Comprehensive HTTP and WebSocket logging.
    - Modular codebase with separation of concerns.
    - Entry point reduced to 24 lines.
    - All modules export testable functions.
- **Next Steps:** TBD (potential: real question API, leaderboard persistence, power-ups).
