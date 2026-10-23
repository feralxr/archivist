import { createServer } from "node:http";
import { createGitHubApp, createWebhookMiddleware } from "./github/app.js";
import { env, hasGitHubApp, hasAnyModelKey } from "./core/config.js";
import { log } from "./core/logger.js";
import { reviewQueue } from "./core/queue.js";

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

  if (!hasAnyModelKey()) {
    log.warn("No model API key set — reviews will be skipped");
  }

  const app = createGitHubApp();
  const middleware = createWebhookMiddleware(app);

  const server = createServer(async (req, res) => {
    const url = req.url || "/";

    if (url === "/health" || url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "archivist",
          queue: reviewQueue.stats,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (url === "/ready") {
      const ready = hasGitHubApp() && hasAnyModelKey();
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready, githubApp: hasGitHubApp(), model: hasAnyModelKey() }));
      return;
    }

    try {
      middleware(req, res, () => {
        res.writeHead(404);
        res.end("Not found");
      });
    } catch (err) {
      log.error("Webhook middleware error", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.writeHead(500);
      res.end("Internal error");
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const port = env.PORT || 3000;
  server.listen(port, () => {
    log.info(`Listening on http://localhost:${port}`);
    log.info(`Webhook  → /api/github/webhooks`);
    log.info(`Health   → /health`);
    log.info(`Ready    → /ready`);
  });
}

main().catch((err) => {
  log.error("Failed to start server", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
