require("dotenv").config();
const { generateRoundContent } = require("../src/services/openAIService");

async function testOpenAI() {
  console.log("Testing OpenAI Service\n");
  console.log("=" .repeat(60));

  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  No OPENAI_API_KEY found in .env");
    console.log("   Testing with mock fallback...\n");
  } else {
    console.log("✓ OPENAI_API_KEY is configured");
    console.log("  Testing with OpenAI API...\n");
  }

  const topics = ["History", "Pizza", "Science"];

  for (const topic of topics) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Testing topic: "${topic}"`);
    console.log("─".repeat(60));

    try {
      const result = await generateRoundContent(topic, 3);

      console.log(`\n✓ Success!`);
      console.log(`\nPunny Title: "${result.punnyTitle}"`);
      console.log(`\nGenerated ${result.questions.length} questions:`);

      result.questions.forEach((q, index) => {
        console.log(`\n${index + 1}. ${q.text}`);
        q.options.forEach((opt, optIndex) => {
          const marker = optIndex === q.correct ? "✓" : " ";
          console.log(`   ${marker} ${String.fromCharCode(65 + optIndex)}. ${opt}`);
        });
        console.log(`   Correct: ${String.fromCharCode(65 + q.correct)}`);
      });

      // Validate structure
      console.log(`\n✓ Validation passed:`);
      console.log(`  - Has punnyTitle: ${!!result.punnyTitle}`);
      console.log(`  - Has questions array: ${Array.isArray(result.questions)}`);
      console.log(`  - Question count: ${result.questions.length}`);

      const allValid = result.questions.every(q =>
        q.text &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correct === "number" &&
        q.correct >= 0 &&
        q.correct <= 3
      );
      console.log(`  - All questions valid: ${allValid}`);

      if (!allValid) {
        console.error("❌ Validation failed!");
        process.exit(1);
      }

    } catch (error) {
      console.error(`\n❌ Error testing topic "${topic}":`, error.message);
      process.exit(1);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ All tests passed!");
  console.log("=".repeat(60));
  process.exit(0);
}

// Run the test
testOpenAI().catch(error => {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
});
