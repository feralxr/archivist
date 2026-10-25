import { App } from "@octokit/app";
import { createNodeMiddleware } from "@octokit/app";
import type { Octokit } from "@octokit/rest";
import { env, getPrivateKey, requireGitHubApp } from "../core/config.js";
import { handlePullRequestEvent } from "./handlers.js";
import { handleReviewSubmitted, handleReviewCommentCreated } from "./learn.js";
import {
  handleInstallationCreated,
  handleInstallationReposAdded,
} from "./installation.js";
import { log } from "../core/logger.js";

/**
 * Archivist GitHub App — production entry for automatic PR reviews.
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

  app.webhooks.on("pull_request.ready_for_review", async (event) => {
    await handlePullRequestEvent(event as any, "opened");
  });

  app.webhooks.on("pull_request_review.submitted", async (event) => {
    await handleReviewSubmitted(event);
  });

  // Inline review comments / thread replies
  app.webhooks.on("pull_request_review_comment.created", async (event) => {
    await handleReviewCommentCreated(event);
  });

  // Day-1 memory: bootstrap when installed on repos
  app.webhooks.on("installation.created", async (event) => {
    await handleInstallationCreated(event);
  });

  app.webhooks.on("installation_repositories.added", async (event) => {
    await handleInstallationReposAdded(event);
  });

  app.webhooks.onError((error) => {
    log.error("Webhook error", {
      message: error.message,
      name: error.name,
    });
  });

  return app;
}

export function createWebhookMiddleware(app: ReturnType<typeof createGitHubApp>) {
  // @octokit/app defaults to path "/api/github/webhooks"
  return createNodeMiddleware(app);
}

export async function getInstallationOctokit(
  app: ReturnType<typeof createGitHubApp>,
  installationId: number
): Promise<Octokit> {
  return (await app.getInstallationOctokit(installationId)) as unknown as Octokit;
}
