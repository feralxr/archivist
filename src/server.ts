import { createServer } from "node:http";
import { createGitHubApp, createWebhookMiddleware } from "./github/app.js";
import { env } from "./core/config.js";

/**
 * Archivist GitHub App server
 *
 * Run with:
 *   npx tsx src/server.ts
 *
 * For local development use something like ngrok or cloudflared
 * to expose the webhook endpoint.
 */

async function main() {
  console.log("Starting Archivist GitHub App server...");

  if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
    console.error(
      "Missing GITHUB_APP_ID or GITHUB_PRIVATE_KEY.\n" +
        "Create a GitHub App and add the credentials to .env"
    );
    process.exit(1);
  }

  const app = createGitHubApp();
  const middleware = createWebhookMiddleware(app);

  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "archivist" }));
      return;
    }

    // Hand off to Octokit webhook middleware
    middleware(req, res, () => {
      res.writeHead(404);
      res.end("Not found");
    });
  });

  const port = env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Archivist listening on http://localhost:${port}`);
    console.log(`Webhook path: /api/github/webhooks`);
    console.log(`Health:       /health`);
  });
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
