import { App } from "@octokit/app";
import { createNodeMiddleware } from "@octokit/app";
import type { Octokit } from "@octokit/rest";
import { env, getPrivateKey, requireGitHubApp } from "../core/config.js";
import { handlePullRequestEvent } from "./handlers.js";
import {
  handleReviewSubmitted,
  handleReviewCommentCreated,
} from "./learn.js";
import {
  handleInstallationCreated,
  handleInstallationReposAdded,
} from "./installation.js";
import {
  beginDelivery,
  completeDelivery,
  failDelivery,
} from "./delivery.js";
import { log } from "../core/logger.js";

/**
 * Wrap a webhook handler with delivery idempotency + error propagation.
 * Throwing causes non-2xx so GitHub redelivers; completed deliveries are skipped.
 */
function trackDelivery<E extends { id: string }>(
  eventName: string,
  handler: (event: E) => Promise<void>
): (event: E) => Promise<void> {
  return async (event: E) => {
    const { skip, attempts } = beginDelivery(event.id, eventName);
    if (skip) return;

    try {
      await handler(event);
      completeDelivery(event.id);
    } catch (err) {
      failDelivery(event.id, err);
      // Re-throw so @octokit middleware returns 500 → GitHub retries
      throw err;
    }
  };
}

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

  app.webhooks.on(
    "pull_request.opened",
    trackDelivery("pull_request.opened", async (event) => {
      await handlePullRequestEvent(event, "opened");
    })
  );

  app.webhooks.on(
    "pull_request.synchronize",
    trackDelivery("pull_request.synchronize", async (event) => {
      await handlePullRequestEvent(event, "synchronize");
    })
  );

  app.webhooks.on(
    "pull_request.ready_for_review",
    trackDelivery("pull_request.ready_for_review", async (event) => {
      await handlePullRequestEvent(event as any, "opened");
    })
  );

  app.webhooks.on(
    "pull_request_review.submitted",
    trackDelivery("pull_request_review.submitted", async (event) => {
      await handleReviewSubmitted(event);
    })
  );

  app.webhooks.on(
    "pull_request_review_comment.created",
    trackDelivery("pull_request_review_comment.created", async (event) => {
      await handleReviewCommentCreated(event);
    })
  );

  app.webhooks.on(
    "installation.created",
    trackDelivery("installation.created", async (event) => {
      await handleInstallationCreated(event);
    })
  );

  app.webhooks.on(
    "installation_repositories.added",
    trackDelivery("installation_repositories.added", async (event) => {
      await handleInstallationReposAdded(event);
    })
  );

  app.webhooks.onError((error) => {
    log.error("Webhook error", {
      message: error.message,
      name: error.name,
      // status codes help diagnose signature vs handler failures
      status: (error as any).status,
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
