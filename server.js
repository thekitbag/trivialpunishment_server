const http = require("http");
const ip = require("ip");
const readline = require("readline");
const { PORT, QUESTION_MODEL, AVAILABLE_MODELS } = require("./src/config");
const { initDb, ensureGamesColumns, ensurePlayersColumns } = require("./src/db");
const app = require("./src/app");
const createSocketServer = require("./src/socket");
const { setModel } = require("./src/services/openAIService");

/**
 * Prompts user to select a question generation model
 * @returns {Promise<string>} Selected model name
 */
async function promptForModel() {
  // If QUESTION_MODEL is set in env, use it without prompting
  if (QUESTION_MODEL) {
    console.log(`[config] Using QUESTION_MODEL from environment: ${QUESTION_MODEL}\n`);
    return QUESTION_MODEL;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log("\n" + "=".repeat(80));
    console.log("  QUESTION GENERATION MODEL SELECTION");
    console.log("=".repeat(80));
    console.log("\nChoose which model to use for generating trivia questions:\n");

    AVAILABLE_MODELS.forEach((model, index) => {
      console.log(`  ${index + 1}. ${model.label}`);
      console.log(`     ${model.description}`);
      console.log();
    });

    console.log("Tip: You can set QUESTION_MODEL in .env to skip this prompt\n");

    const defaultChoice = AVAILABLE_MODELS.findIndex(m => m.value === "gpt-4o-mini") + 1;

    rl.question(`Select model (1-${AVAILABLE_MODELS.length}) [default: ${defaultChoice}]: `, (answer) => {
      rl.close();

      const choice = answer.trim() === "" ? defaultChoice : parseInt(answer);
      const selectedModel = AVAILABLE_MODELS[choice - 1];

      if (!selectedModel) {
        console.log(`Invalid choice. Using default: gpt-4o-mini\n`);
        resolve("gpt-4o-mini");
      } else {
        console.log(`\n✓ Selected: ${selectedModel.label}\n`);
        resolve(selectedModel.value);
      }
    });
  });
}

async function start() {
  // Prompt for model selection
  const selectedModel = await promptForModel();
  setModel(selectedModel);

  await initDb();
  await ensureGamesColumns();
  await ensurePlayersColumns();

  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    const lanIp = ip.address();
    console.log(`[http] listening on http://localhost:${PORT}`);
    console.log(`[lan]  listening on http://${lanIp}:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[startup] failed", err);
  process.exitCode = 1;
});
