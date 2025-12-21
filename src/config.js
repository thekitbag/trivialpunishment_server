require("dotenv").config();
const path = require("path");

module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  DB_DIR: path.join(__dirname, "../server"),
  DB_PATH: path.join(__dirname, "../server/game_data.db"),
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-in-production",

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
