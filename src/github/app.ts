import { App } from "@octokit/app";
import { createNodeMiddleware } from "@octokit/app";
import type { Octokit } from "@octokit/rest";
import { env, getPrivateKey, requireGitHubApp } from "../core/config.js";
import { handlePullRequestEvent } from "./handlers.js";
import { handleReviewSubmitted } from "./learn.js";

/**
 * Archivist GitHub App
 */
export function createGitHubApp() {
  requireGitHubApp();

  const app = new App({
    appId: env.GITHUB_APP_ID!,
    privateKey: getPrivateKey(),
    webhooks: {
      secret: env.GITHUB_WEBHOOK_SECRET || "development-secret",
    },
  });

  app.webhooks.on("pull_request.opened", async (event) => {
    await handlePullRequestEvent(event, "opened");
  });

  app.webhooks.on("pull_request.synchronize", async (event) => {
    await handlePullRequestEvent(event, "synchronize");
  });

  // Learn from human reviews
  app.webhooks.on("pull_request_review.submitted", async (event) => {
    await handleReviewSubmitted(event);
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

export async function getInstallationOctokit(
  app: ReturnType<typeof createGitHubApp>,
  installationId: number
): Promise<Octokit> {
  return (await app.getInstallationOctokit(installationId)) as unknown as Octokit;
}
