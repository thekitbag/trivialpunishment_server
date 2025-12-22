require("dotenv").config();
const { generateRoundContent } = require("../src/services/openAIService");

async function simpleTest() {
  console.log("Simple OpenAI Service Test\n");

  const topic = "History";
  const count = 5;

  console.log(`Generating ${count} questions about "${topic}"...\n`);

  const result = await generateRoundContent(topic, count);

  console.log(`Punny Title: ${result.punnyTitle}`);
  console.log(`Questions: ${result.questions.length}\n`);

  result.questions.forEach((q, i) => {
    console.log(`${i + 1}. ${q.text}`);
  });

  console.log("\n✓ Done!");
}

simpleTest().catch(console.error);
