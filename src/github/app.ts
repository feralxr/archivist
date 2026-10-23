import { App } from "@octokit/app";
import { createNodeMiddleware } from "@octokit/app";
import type { Octokit } from "@octokit/rest";
import { env } from "../core/config.js";
import { handlePullRequestEvent } from "./handlers.js";

/**
 * Archivist GitHub App
 *
 * This is the long-running service that:
 * - Receives webhooks from GitHub
 * - Builds / updates project memory
 * - Posts intelligent reviews on PRs
 */

export function createGitHubApp() {
  if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
    throw new Error(
      "GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required to run the GitHub App"
    );
  }

  const app = new App({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n"),
    webhooks: {
      secret: env.GITHUB_WEBHOOK_SECRET || "development-secret",
    },
  });

  // Pull request opened or synchronized (new commits pushed)
  app.webhooks.on("pull_request.opened", async (event) => {
    await handlePullRequestEvent(event, "opened");
  });

  app.webhooks.on("pull_request.synchronize", async (event) => {
    await handlePullRequestEvent(event, "synchronize");
  });

  // When a review is submitted by a human, we can learn from it later
  app.webhooks.on("pull_request_review.submitted", async (event) => {
    // Future: extract high-signal human review comments into memory
    console.log(
      `[webhook] review submitted on ${event.payload.repository.full_name}#${event.payload.pull_request.number}`
    );
  });

  app.webhooks.onError((error) => {
    console.error("[webhook error]", error);
  });

  return app;
}

export function createWebhookMiddleware(app: ReturnType<typeof createGitHubApp>) {
  return createNodeMiddleware(app.webhooks, {
    path: "/api/github/webhooks",
  });
}

/**
 * Get an authenticated Octokit for a specific installation
 */
export async function getInstallationOctokit(
  app: ReturnType<typeof createGitHubApp>,
  installationId: number
): Promise<Octokit> {
  return (await app.getInstallationOctokit(installationId)) as unknown as Octokit;
}
