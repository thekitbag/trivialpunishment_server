require("dotenv").config();
const path = require("path");

module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  DB_DIR: path.join(__dirname, "../server"),
  DB_PATH: path.join(__dirname, "../server/game_data.db"),
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-in-production",

  // Question generation model
  // Can be set via QUESTION_MODEL env var or interactive prompt
  // Options: "mock", "gpt-4o-mini", "gpt-4o", "gpt-4", "gpt-4-turbo", "o1", "o3-mini"
  QUESTION_MODEL: process.env.QUESTION_MODEL || null,

  // Available models for question generation
  AVAILABLE_MODELS: [
    { value: "mock", label: "Mock Questions (Free - No API)", description: "Use pre-defined dad joke questions" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Recommended)", description: "Fast & cheap (~$0.001/round)" },
    { value: "gpt-4o", label: "GPT-4o", description: "More capable (~$0.01/round)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "Previous gen flagship (~$0.02/round)" },
    { value: "gpt-4", label: "GPT-4", description: "Original GPT-4 (~$0.06/round)" },
    { value: "o1", label: "O1 (Reasoning)", description: "Advanced reasoning model (expensive)" },
    { value: "o3-mini", label: "O3 Mini (Reasoning)", description: "Reasoning model - mini version" }
  ],

  // Game timing constants (in milliseconds)
  QUESTION_TIME_MS: 30000,
  REVEAL_TIME_MS: 5000,
  STARTING_DELAY_MS: 3000,
  ROUND_OVER_DELAY_MS: 10000,

  // Mock question data
  MOCK_QUESTIONS: [
    {
      text: "Why did the scarecrow win an award?",
      options: ["He was outstanding in his field", "He had brains", "He was funny", "He worked hard"],
      correct: 0
    },
    {
      text: "What do you call a bear with no teeth?",
      options: ["A gummy bear", "A teddy bear", "A scary bear", "A baby bear"],
      correct: 0
    },
    {
      text: "Why don't scientists trust atoms?",
      options: ["They're too small", "They make up everything", "They're unstable", "They're invisible"],
      correct: 1
    },
    {
      text: "What did the ocean say to the beach?",
      options: ["Hello", "Nothing, it just waved", "Goodbye", "Nice weather"],
      correct: 1
    },
    {
      text: "Why did the bicycle fall over?",
      options: ["It was broken", "It was two tired", "It was old", "Someone pushed it"],
      correct: 1
    }
  ]
};
