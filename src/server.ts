import { createServer } from "node:http";
import { createGitHubApp, createWebhookMiddleware } from "./github/app.js";
import { env, hasGitHubApp, hasOpenRouter } from "./core/config.js";

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║         Archivist GitHub App         ║");
  console.log("╚══════════════════════════════════════╝");

  if (!hasGitHubApp()) {
    console.error(
      "\nMissing GitHub App credentials.\n" +
        "Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY in .env\n" +
        "Run: npx tsx src/cli/index.ts setup\n"
    );
    process.exit(1);
  }

  if (!hasOpenRouter()) {
    console.warn(
      "⚠ OPENROUTER_API_KEY not set — reviews will be skipped until configured.\n"
    );
  }

  const app = createGitHubApp();
  const middleware = createWebhookMiddleware(app);

  const server = createServer(async (req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "archivist",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    middleware(req, res, () => {
      res.writeHead(404);
      res.end("Not found");
    });
  });

  const port = env.PORT || 3000;
  server.listen(port, () => {
    console.log(`\nListening on http://localhost:${port}`);
    console.log(`Webhook  → http://localhost:${port}/api/github/webhooks`);
    console.log(`Health   → http://localhost:${port}/health`);
    console.log("\nReady to receive GitHub webhooks.\n");
  });
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
