const OpenAI = require("openai");
const { MOCK_QUESTIONS, QUESTION_MODEL } = require("../config");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Current model being used (set during server startup)
let currentModel = QUESTION_MODEL;

/**
 * Sets the model to use for question generation
 * @param {string} model - Model name (e.g., "gpt-4o-mini", "mock")
 */
function setModel(model) {
  currentModel = model;
  console.log(`[OpenAI] Model set to: ${model}`);
}

/**
 * Gets the current model being used
 * @returns {string} Current model name
 */
function getModel() {
  return currentModel;
}

/**
 * Generates a punny title and trivia questions for a given topic using OpenAI
 * @param {string} topic - The topic for the trivia round (e.g., "History", "Pizza")
 * @param {number} count - Number of questions to generate (default: 5)
 * @param {string} difficulty - Difficulty level: 'Easy', 'Medium', 'Hard', or 'Mixed' (default: 'Mixed')
 * @param {string} questionType - Question type: 'multiple_choice', 'free_text', or 'mixed' (default: 'mixed')
 * @returns {Promise<Object>} Object containing punnyTitle and questions array
 */
async function generateRoundContent(topic, count = 5, difficulty = 'Mixed', questionType = 'mixed') {
  // If model is set to "mock", return mock data
  if (currentModel === "mock") {
    console.log("[OpenAI] Using mock questions (model set to 'mock')");
    return generateMockContent(topic, count);
  }

  // If no API key is configured, return mock data
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[OpenAI] No API key found, using mock questions");
    return generateMockContent(topic, count);
  }

  try {
    const systemPrompt = `You are a trivia expert creating engaging quiz content for a party game.

Rules:
1. Generate REAL trivia questions about the given topic (not puns or jokes)
2. Questions should be accessible and fun (not obscure academic facts)
3. The punnyTitle should be a cheesy dad joke/pun related to the topic
4. Return ONLY valid JSON, no markdown formatting or explanations
5. Content must be family-friendly
6. Support two question types: multiple_choice and free_text`;

    // Generate difficulty instruction based on difficulty level
    const difficultyInstructions = {
      'Easy': 'Make questions very simple and common knowledge suitable for casual players.',
      'Medium': 'Make questions standard trivia difficulty.',
      'Hard': 'Make questions challenging and obscure, suitable for trivia buffs.',
      'Mixed': 'Mix difficulty levels (easy, medium, hard).'
    };
    const difficultyInstruction = difficultyInstructions[difficulty] || difficultyInstructions['Mixed'];

    // Generate question type instruction
    let questionTypeInstruction = '';
    if (questionType === 'multiple_choice') {
      questionTypeInstruction = 'Generate ONLY multiple choice questions with 4 options.';
    } else if (questionType === 'free_text') {
      questionTypeInstruction = 'Generate ONLY free text questions that require typing the answer.';
    } else {
      questionTypeInstruction = 'Mix question types (about 60% multiple choice, 40% free text).';
    }

    const userPrompt = `Generate a trivia round for the topic "${topic}".

Return valid JSON matching this exact schema:
{
  "punnyTitle": "A cheesy dad joke/pun related to ${topic}",
  "questions": [
    {
      "type": "multiple_choice",
      "text": "Question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0
    },
    {
      "type": "free_text",
      "text": "Question text...",
      "acceptedAnswers": ["Primary Answer", "Synonym 1", "Common Misspelling"],
      "correctAnswerDisplay": "Primary Answer"
    }
  ]
}

IMPORTANT:
- The punnyTitle should be a PUN (e.g., for "Bananas": "Going Bananas")
- Questions should be REAL TRIVIA about ${topic}
- Include exactly ${count} questions
- ${questionTypeInstruction}
- ${difficultyInstruction}

For multiple_choice questions:
- Provide exactly 4 options
- Set correct to the index (0-3) of the correct answer

For free_text questions:
- Include acceptedAnswers array with:
  * The primary correct answer
  * Common synonyms
  * Common misspellings (e.g., "teh" for "the")
  * Related variations (e.g., "Brandon Flowers" or "The Killers" for a question about the band's lead singer)
- Set correctAnswerDisplay to the preferred display answer
- Make questions specific enough that there's a clear answer`;

    console.log("\n" + "=".repeat(80));
    console.log("[OpenAI] 🚀 Starting API call for topic:", topic);
    console.log("=".repeat(80));
    console.log("\n[OpenAI] 📤 SYSTEM PROMPT:");
    console.log("-".repeat(80));
    console.log(systemPrompt);
    console.log("-".repeat(80));
    console.log("\n[OpenAI] 📤 USER PROMPT:");
    console.log("-".repeat(80));
    console.log(userPrompt);
    console.log("-".repeat(80));

    // Use the configured model (default to gpt-4o-mini if not set)
    const modelToUse = currentModel || "gpt-4o-mini";

    console.log(`[OpenAI] Using model: ${modelToUse}`);

    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;

    console.log("\n[OpenAI] 📥 RAW API RESPONSE:");
    console.log("-".repeat(80));
    console.log(content);
    console.log("-".repeat(80));

    const parsed = JSON.parse(content);

    console.log("\n[OpenAI] ✅ PARSED JSON:");
    console.log("-".repeat(80));
    console.log(JSON.stringify(parsed, null, 2));
    console.log("-".repeat(80));

    // Validate the response structure
    console.log("\n[OpenAI] 🔍 Validating response structure...");
    if (!parsed.punnyTitle || !Array.isArray(parsed.questions)) {
      throw new Error("Invalid response structure from OpenAI");
    }
    console.log("  ✓ Has punnyTitle:", parsed.punnyTitle);
    console.log("  ✓ Has questions array:", parsed.questions.length, "questions");

    // Validate each question
    console.log("\n[OpenAI] 🔍 Validating individual questions...");
    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];

      // Default type to multiple_choice if not specified (backward compatibility)
      if (!q.type) {
        q.type = 'multiple_choice';
      }

      if (!q.text) {
        throw new Error(`Invalid question structure at index ${i}: missing text`);
      }

      if (q.type === 'multiple_choice') {
        if (!Array.isArray(q.options) || q.options.length !== 4 || typeof q.correct !== "number") {
          throw new Error(`Invalid multiple_choice question structure at index ${i}`);
        }
        if (q.correct < 0 || q.correct > 3) {
          throw new Error(`Invalid correct answer index at question ${i}: ${q.correct}`);
        }
        console.log(`  ✓ Question ${i + 1} [MC]: "${q.text.substring(0, 50)}..." (correct: ${q.correct})`);
      } else if (q.type === 'free_text') {
        if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) {
          throw new Error(`Invalid free_text question at index ${i}: missing acceptedAnswers`);
        }
        if (!q.correctAnswerDisplay) {
          throw new Error(`Invalid free_text question at index ${i}: missing correctAnswerDisplay`);
        }
        console.log(`  ✓ Question ${i + 1} [FT]: "${q.text.substring(0, 50)}..." (${q.acceptedAnswers.length} accepted answers)`);
      } else {
        throw new Error(`Unknown question type at index ${i}: ${q.type}`);
      }
    }

    console.log("\n[OpenAI] ✅ VALIDATION PASSED");
    console.log(`[OpenAI] 🎉 Successfully generated ${parsed.questions.length} questions for topic: "${topic}"`);
    console.log(`[OpenAI] 🎯 Punny title: "${parsed.punnyTitle}"`);
    console.log("=".repeat(80) + "\n");

    return parsed;

  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("[OpenAI] ❌ ERROR generating content");
    console.error("=".repeat(80));
    console.error("Error message:", error.message);
    if (error.response) {
      console.error("API response status:", error.response.status);
      console.error("API response data:", JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    console.error("=".repeat(80));

    // Fallback to mock data on any error
    console.warn("\n[OpenAI] ⚠️  Falling back to mock questions for topic:", topic);
    return generateMockContent(topic, count);
  }
}

/**
 * Generates mock content when OpenAI is unavailable
 * @param {string} topic - The topic for the trivia round
 * @param {number} count - Number of questions to generate
 * @returns {Object} Mock content with punnyTitle and questions
 */
function generateMockContent(topic, count) {
  const mockTitles = {
    "history": "Past Tents",
    "science": "Element-ary My Dear Watson",
    "geography": "Globe Trotting",
    "sports": "Ball Games",
    "food": "Pun Intended",
    "music": "Note Worthy",
    "movies": "Reel Talk",
    "art": "Master Pieces",
    "literature": "Novel Ideas",
    "default": `${topic} Puns`
  };

  const punnyTitle = mockTitles[topic.toLowerCase()] || mockTitles.default;

  // Cycle through mock questions to fill the requested count
  const questions = [];
  for (let i = 0; i < count; i++) {
    const mockQ = MOCK_QUESTIONS[i % MOCK_QUESTIONS.length];
    // Add type field for backward compatibility
    questions.push({
      type: 'multiple_choice',
      ...mockQ
    });
  }

  return {
    punnyTitle,
    questions
  };
}

module.exports = {
  generateRoundContent,
  setModel,
  getModel
};
