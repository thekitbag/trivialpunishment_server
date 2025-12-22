# Trivial Punishment Server

A local multiplayer, mobile-first trivia game server built with Node.js, Express, Socket.io, and SQLite.

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup](#setup)
- [Running the App](#running-the-app)
- [Environment Configuration](#environment-configuration)
- [OpenAI Integration](#openai-integration)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Game Flow](#game-flow)
- [API Documentation](#api-documentation)

## Features

- **Real-time multiplayer gameplay** using WebSocket (Socket.io)
- **User authentication** with JWT and bcrypt password hashing
- **Time-based scoring** - Answer faster for more points (100 points instant → 10 points at time limit)
- **AI-generated questions** using OpenAI API with automatic fallback to mock questions
- **Topic selection** - Players take turns choosing trivia topics
- **Punny round titles** - AI-generated dad joke style titles for each round
- **Game persistence** - SQLite database stores user accounts and game history
- **Reconnection support** - Players can rejoin games if disconnected
- **Mobile-first design** - Optimized for local network play on phones/tablets

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Real-time Communication:** Socket.io
- **Database:** SQLite3
- **Authentication:** JWT + bcrypt
- **AI Integration:** OpenAI API (gpt-4o-mini)

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   cd trivialpunishment_server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the root directory:
   ```bash
   # Server Configuration
   PORT=3001

   # Authentication
   JWT_SECRET=your-super-secret-jwt-key-here

   # OpenAI API (Optional - falls back to mock questions if not provided)
   OPENAI_API_KEY=sk-your-api-key-here

   # Question Model (Optional - will prompt on startup if not set)
   # Options: mock, gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-4, o1, o3-mini
   QUESTION_MODEL=gpt-4o-mini
   ```

   **Important:**
   - `JWT_SECRET`: Use a strong, random string for production
   - `OPENAI_API_KEY`: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - `QUESTION_MODEL`: Choose which model to use (see [Model Selection](#model-selection) below)
   - If `QUESTION_MODEL` is not set, you'll be prompted to choose on server start

4. **Initialize the database**

   The database is automatically created on first run. No manual setup required!

## Running the App

### Start the server

```bash
npm start
```

Or directly:
```bash
node server.js
```

### Expected output

If `QUESTION_MODEL` is not set in `.env`, you'll first see the model selection prompt. After selecting a model:

```
✓ Selected: GPT-4o Mini (Recommended)

Database initialized successfully.
[http] listening on http://localhost:3001
[lan]  listening on http://192.168.1.XXX:3001
```

The server will:
- Prompt for model selection (if not configured in `.env`)
- Initialize the SQLite database (`server/game_data.db`)
- Start the HTTP server on port 3001 (or your configured PORT)
- Display the local network URL for mobile device connections
- Begin accepting WebSocket connections

### Connecting from mobile devices

1. Ensure your phone/tablet is on the same WiFi network as the server
2. Note the "Local network URL" from the server output
3. Open that URL in your mobile browser
4. Start playing!

## Environment Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Port the server listens on |
| `JWT_SECRET` | **Yes** | *(dev fallback)* | Secret key for JWT token signing |
| `OPENAI_API_KEY` | No | *(uses mock)* | OpenAI API key for question generation |
| `QUESTION_MODEL` | No | *(prompts on start)* | Model to use: `mock`, `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`, `gpt-4`, `o1`, `o3-mini` |

### Model Selection

When starting the server, you can choose which model to use for question generation:

**Option 1: Interactive Prompt (Recommended for Development)**

If `QUESTION_MODEL` is not set in `.env`, you'll see an interactive menu on startup:

```
================================================================================
  QUESTION GENERATION MODEL SELECTION
================================================================================

Choose which model to use for generating trivia questions:

  1. Mock Questions (Free - No API)
     Use pre-defined dad joke questions

  2. GPT-4o Mini (Recommended)
     Fast & cheap (~$0.001/round)

  3. GPT-4o
     More capable (~$0.01/round)

  4. GPT-4 Turbo
     Previous gen flagship (~$0.02/round)

  5. GPT-4
     Original GPT-4 (~$0.06/round)

  6. O1 (Reasoning)
     Advanced reasoning model (expensive)

  7. O3 Mini (Reasoning)
     Reasoning model - mini version

Select model (1-7) [default: 2]:
```

Simply enter the number or press Enter for the default (GPT-4o Mini).

**Option 2: Environment Variable (Recommended for Production)**

Set `QUESTION_MODEL` in your `.env` file to skip the prompt:

```bash
# Use mock questions (free, no API needed)
QUESTION_MODEL=mock

# Use GPT-4o Mini (recommended - fast and cheap)
QUESTION_MODEL=gpt-4o-mini

# Use GPT-4o (more capable but pricier)
QUESTION_MODEL=gpt-4o

# Use GPT-4 Turbo
QUESTION_MODEL=gpt-4-turbo

# Use original GPT-4
QUESTION_MODEL=gpt-4

# Use O1 reasoning model
QUESTION_MODEL=o1

# Use O3 Mini reasoning model
QUESTION_MODEL=o3-mini
```

**Model Comparison:**

| Model | Speed | Quality | Cost/Round | Best For |
|-------|-------|---------|------------|----------|
| `mock` | Instant | Dad jokes | Free | Testing, no API key |
| `gpt-4o-mini` | Fast | Good | ~$0.001 | Production (recommended) |
| `gpt-4o` | Fast | Excellent | ~$0.01 | High-quality questions |
| `gpt-4-turbo` | Medium | Excellent | ~$0.02 | Previous flagship |
| `gpt-4` | Slower | Excellent | ~$0.06 | Original GPT-4 |
| `o1` | Slow | Reasoning | Expensive | Complex reasoning tasks |
| `o3-mini` | Medium | Reasoning | Moderate | Reasoning (cheaper) |

### Database

- **Location:** `server/game_data.db`
- **Type:** SQLite3
- **Auto-created:** Yes, on first run
- **Schema:** Automatically initialized and migrated

## OpenAI Integration

### Overview

The OpenAI service generates punny titles and trivia questions for game rounds using the OpenAI API. You can choose from multiple AI models or use mock questions. The system includes automatic fallback to mock questions when the API is unavailable.

### Setup OpenAI (Optional)

1. **Install OpenAI dependency** (already included)
   ```bash
   npm install openai
   ```

2. **Get an API key**

   Visit [OpenAI Platform](https://platform.openai.com/api-keys) and create an API key

3. **Configure your .env**
   ```bash
   OPENAI_API_KEY=sk-your-api-key-here
   QUESTION_MODEL=gpt-4o-mini
   ```

4. **Start the server**
   ```bash
   npm start
   ```

   If you don't set `QUESTION_MODEL`, you'll be prompted to choose on startup. See [Model Selection](#model-selection) for details.

### How It Works

When a player selects a topic:
- The server calls your selected OpenAI model (e.g., `gpt-4o-mini`)
- Generates a punny title (e.g., "History" → "Past Tents")
- Creates 5 trivia questions with 4 options each
- If model is set to "mock" or API is unavailable → uses mock questions

### Response Format

```javascript
{
  "punnyTitle": "Past Tents",
  "questions": [
    {
      "text": "Question text...",
      "options": ["A", "B", "C", "D"],
      "correct": 0  // Index of correct answer (0-3)
    }
    // ... 4 more questions
  ]
}
```

### Features

- **Automatic Fallback:** Uses mock questions if API fails or key is missing
- **Cost-Effective:** Uses `gpt-4o-mini` (~$0.001-0.002 per round)
- **Creative Prompts:** Temperature `0.8` for varied, fun questions
- **Family-Friendly:** Configured for appropriate content
- **JSON Mode:** Reliable, structured responses
- **Topic-Specific Puns:** Custom punny titles for common topics

### Mock Fallback Titles

When OpenAI is unavailable, topic-specific puns are used:
- History → "Past Tents"
- Science → "Element-ary My Dear Watson"
- Geography → "Globe Trotting"
- Sports → "Ball Games"
- Food → "Pun Intended"
- *(and more...)*

### Troubleshooting OpenAI

**"No API key found" message:**
- Check `.env` file has `OPENAI_API_KEY=sk-...`
- Restart server after adding the key

**API errors:**
- Verify API key is valid at [OpenAI Platform](https://platform.openai.com)
- Check your OpenAI account has credits
- Check for rate limits
- Service automatically falls back to mock questions

## Testing

All test files are located in the `tests/` directory.

### Run All Tests

```bash
# Test time-based scoring
node tests/test_time_based_scoring.js

# Test answer submission
node tests/test_answer_submission.js

# Test game integration
node tests/test_game_integration.js

# Test round lifecycle
node tests/test_round_lifecycle.js

# Test basic game flow
node tests/test_game.js

# Test OpenAI service (comprehensive)
node tests/test_openai.js

# Test OpenAI service (simple)
node tests/test_openai_simple.js
```

### Test Descriptions

| Test File | Description |
|-----------|-------------|
| `test_time_based_scoring.js` | Verifies time-based scoring (fast=100pts, slow=10pts) |
| `test_answer_submission.js` | Tests answer submission and player notification |
| `test_game_integration.js` | End-to-end game flow test |
| `test_round_lifecycle.js` | Tests round transitions and state management |
| `test_game.js` | Basic game creation and joining |
| `test_openai.js` | Full OpenAI service test with multiple topics |
| `test_openai_simple.js` | Quick OpenAI service validation |

### Testing Requirements

1. **Start the server first:**
   ```bash
   npm start
   ```

2. **Run tests in a separate terminal:**
   ```bash
   node tests/test_time_based_scoring.js
   ```

### Expected Test Output

```
✅ TEST PASSED: Time-based scoring works correctly!
```

## Project Structure

```
trivialpunishment_server/
├── server.js                 # Entry point (24 lines)
├── package.json              # Dependencies and scripts
├── .env                      # Environment configuration (not committed)
├── README.md                 # This file
├── agent_context.md          # AI agent context documentation
│
├── server/
│   └── game_data.db          # SQLite database (auto-created)
│
├── src/
│   ├── app.js                # Express app and HTTP routes
│   ├── config.js             # Environment variables and constants
│   │
│   ├── db/
│   │   └── index.js          # Database connection and helpers
│   │
│   ├── services/
│   │   ├── authService.js    # Authentication logic
│   │   ├── gameService.js    # Game state machine and logic
│   │   └── openAIService.js  # OpenAI integration
│   │
│   └── socket/
│       └── index.js          # Socket.io server and event handlers
│
└── tests/
    ├── test_time_based_scoring.js
    ├── test_answer_submission.js
    ├── test_game_integration.js
    ├── test_round_lifecycle.js
    ├── test_game.js
    ├── test_openai.js
    └── test_openai_simple.js
```

## Game Flow

### 1. Authentication (Optional)
- Players can sign up with username/password
- Receive JWT token for authenticated sessions
- Or join as guest without account

### 2. Game Creation
- Host creates game with configuration:
  - Max players (2-8)
  - Rounds per player (1-5)
  - Questions per round (3-10)

### 3. Lobby Phase
- Players join using 4-character game code
- Game auto-starts when max players reached

### 4. Topic Selection
- Players take turns picking a trivia topic
- Topics can be anything (e.g., "Space", "Pizza", "Movies")
- OpenAI generates questions for the chosen topic

### 5. Question Phase (30 seconds)
- Question displayed with 4 multiple-choice options
- Players submit answers
- **Time-based scoring:**
  - Instant answer: **100 points**
  - Answer at 30 seconds: **10 points**
  - Linear scaling in between
  - Wrong answer: **0 points**
- Auto-advances when all players answer

### 6. Reveal Phase (5 seconds)
- Shows correct answer
- Displays updated scores
- Advances to next question or round

### 7. Round Over
- Shows round results and leaderboard
- Next player picks topic for next round

### 8. Game Over
- Final scores displayed
- Results saved to game history
- Players can join new games

## API Documentation

### REST Endpoints

#### Authentication

**POST** `/api/auth/signup`
```json
Request:
{
  "username": "player1",
  "password": "securepassword"
}

Response:
{
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "username": "player1"
  }
}
```

**POST** `/api/auth/login`
```json
Request:
{
  "username": "player1",
  "password": "securepassword"
}

Response:
{
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "username": "player1"
  }
}
```

**GET** `/api/info`
```json
Response:
{
  "lanIP": "192.168.1.100",
  "port": 3001
}
```

### WebSocket Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `create_game` | `{ maxPlayers, roundsPerPlayer, questionsPerRound }` | Create new game |
| `join_game` | `{ username, gameCode }` | Join existing game |
| `submit_topic` | `{ gameCode, topic }` | Submit topic choice |
| `submit_answer` | `{ gameCode, answerIndex }` | Submit answer (0-3) |
| `reconnect_host` | `{ gameCode }` | Reconnect as host |
| `request_player_list` | `{ gameCode }` | Request current players |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `game_created` | `{ gameCode, maxPlayers, ... }` | Game created successfully |
| `update_player_list` | `[{ id, username, score, isHost }]` | Updated player list |
| `game_started` | `{}` | Game starting (lobby → playing) |
| `topic_request` | `{ round, totalRounds }` | Your turn to pick topic |
| `topic_waiting` | `{ pickerUsername, round, ... }` | Waiting for topic |
| `topic_chosen` | `{ topic, pickerUsername }` | Topic selected |
| `question_start` | `{ text, options, timeLimit, ... }` | New question |
| `player_answered` | `{ playerId, username }` | Player submitted answer (host only) |
| `round_reveal` | `{ correctIndex, scores }` | Question results |
| `round_over` | `{ scores, round, totalRounds }` | Round complete |
| `game_over` | `{ scores }` | Game finished |
| `error` | `"error message"` | Error occurred |

## Development

### Module Responsibilities

- **`server.js`** - Initialize database and start server
- **`src/app.js`** - Express app configuration and HTTP routes
- **`src/config.js`** - Environment variables and game constants
- **`src/db/index.js`** - Database connection and query wrappers
- **`src/services/authService.js`** - User authentication (signup, login)
- **`src/services/gameService.js`** - Game state machine and logic
- **`src/services/openAIService.js`** - AI question generation
- **`src/socket/index.js`** - Socket.io event handlers

### Key Constants

Defined in `src/config.js`:
- `QUESTION_TIME_MS`: 30000 (30 seconds)
- `REVEAL_TIME_MS`: 5000 (5 seconds)
- `STARTING_DELAY_MS`: 3000 (3 seconds)
- `ROUND_OVER_DELAY_MS`: 5000 (5 seconds)

### Database Schema

**users**
- `id` (PK), `username` (unique), `password_hash`, `created_at`

**games**
- `game_code` (PK), `host_socket_id`, `game_state`
- `max_players`, `rounds_per_player`, `questions_per_round`, `current_round`

**players**
- `id` (PK), `socket_id`, `username`, `score`, `is_host`
- `game_code` (FK), `user_id` (FK, nullable)

**game_history**
- `id` (PK), `game_code`, `created_at`

**game_history_players**
- `id` (PK), `game_history_id` (FK), `user_id`, `username`, `score`, `rank`

## License

Private - All rights reserved

## Support

For issues or questions, please check:
1. Server logs for error messages
2. Environment configuration is correct
3. Database is initialized properly
4. All dependencies are installed (`npm install`)

---

**Built with ❤️ for local multiplayer trivia fun!**
