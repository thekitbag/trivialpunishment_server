# Agent Context: Trivial Punishment Server

## Project Overview
**Trivial Punishment** is a local multiplayer, mobile-first web game. This repository is the **Backend Server**.
- **Role:** Orchestrates game state, manages connections, and persists data.
- **Stack:** Node.js, Express, Socket.io, SQLite3.

## Architecture
- **Entry Point:** `server.js`.
- **Database:** `server/game_data.db` (SQLite).
- **Communication:**
  - **Socket.io:** Handles real-time events (`create_game`, `join_game`, `game_started`).
  - **HTTP:** Serves the API (Auth endpoints planned).

## Data Model (SQLite)
1.  **`games` Table:**
    - `game_code` (PK, 4-char string).
    - `host_socket_id`, `game_state` ('LOBBY', 'STARTING', etc).
    - Config: `max_players`, `rounds_per_player`, `questions_per_round`.
2.  **`players` Table:**
    - `id` (PK), `socket_id`, `username`.
    - `game_code` (FK).
    - `is_host` (Boolean).

## Key Logic
- **Game Lifecycle:**
  - **Creation:** Generates unique code, stores config in DB.
  - **Lobby:** broadcast `update_player_list` on joins.
  - **Auto-Start:** When `player_count === max_players`, transitions to `STARTING` and emits `game_started`.
- **Resilience:**
  - **Reconnection:** Handles `reconnect_host` by updating `host_socket_id` and sending back state.
  - **Cleanup:** On disconnect, sets `socket_id` to NULL but keeps data (allows rejoin).

## Development Guidelines
- **Database:** Use the `dbRun`, `dbGet`, `dbAll` wrappers (Promises) for all SQL ops.
- **Sockets:** Ensure all handlers are `async` and wrapped in `try/catch` to prevent crashes.
- **Ports:** Defaults to 3001 (configurable via `PORT`).

## Current Status
- **Phase:** Phase 3 Complete (Game Config & Start).
- **Next Steps:** Phase 4 (User Authentication with `bcrypt` & `jwt`).
