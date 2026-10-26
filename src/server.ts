import { createServer } from "node:http";
import { createGitHubApp, createWebhookMiddleware } from "./github/app.js";
import { env, hasGitHubApp, hasAnyModelKey } from "./core/config.js";
import { log } from "./core/logger.js";
import { reviewQueue } from "./core/queue.js";
import { metrics } from "./core/metrics.js";
import { deliveryStats } from "./github/delivery.js";

const VERSION = process.env.npm_package_version || "0.4.8";

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║         Archivist GitHub App         ║");
  console.log("╚══════════════════════════════════════╝");

  if (!hasGitHubApp()) {
    console.error(
      "\nMissing GitHub App credentials.\n" +
        "Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY in .env\n" +
        "Run: archivist setup\n"
    );
    process.exit(1);
  }

  if (!hasAnyModelKey()) {
    log.warn("No model API key set — reviews will be skipped");
  }

  const app = createGitHubApp();
  const middleware = createWebhookMiddleware(app);
  const startedAt = Date.now();

  const server = createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];

    if (url === "/health" || url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "archivist",
          version: VERSION,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          queue: reviewQueue.stats,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (url === "/ready") {
      const ready = hasGitHubApp() && hasAnyModelKey();
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ready,
          githubApp: hasGitHubApp(),
          model: hasAnyModelKey(),
          queue: reviewQueue.stats,
        })
      );
      return;
    }

    if (url === "/metrics") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ...metrics.snapshot(),
          queue: reviewQueue.stats,
          deliveries: deliveryStats(),
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          version: VERSION,
        })
      );
      return;
    }

    try {
      middleware(req, res, () => {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
      });
    } catch (err) {
      log.error("Webhook middleware error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "internal_error" }));
      }
    }
  });

  // Bound request socket time so hung clients don't pile up
  server.requestTimeout = 120_000;
  server.headersTimeout = 60_000;

  const shutdown = () => {
    log.info("Shutting down...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const port = env.PORT || 3000;
  server.listen(port, () => {
    log.info(`Listening on :${port}`, {
      version: VERSION,
      modelReady: hasAnyModelKey(),
    });
    console.log(`\n  Health  → http://localhost:${port}/health`);
    console.log(`  Ready   → http://localhost:${port}/ready`);
    console.log(`  Metrics → http://localhost:${port}/metrics`);
    console.log(`  Webhook → http://localhost:${port}/api/github/webhooks\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
