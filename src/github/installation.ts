import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { createGitHubApp, getInstallationOctokit } from "./app.js";
import { bootstrapRepositoryMemory } from "./ingest.js";
import { memoryStore } from "../memory/store.js";
import { env } from "../core/config.js";
import { log } from "../core/logger.js";
import { reviewQueue } from "../core/queue.js";
import { metrics } from "../core/metrics.js";

type InstallationEvent = EmitterWebhookEvent<"installation">;
type InstallationReposEvent = EmitterWebhookEvent<"installation_repositories">;

function bootstrapEnabled(): boolean {
  const v = (process.env.ARCHIVIST_BOOTSTRAP_ON_INSTALL || "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "off";
}

/**
 * When the app is installed, seed memory from recent merged PRs.
 */
export async function handleInstallationCreated(event: InstallationEvent) {
  if (!bootstrapEnabled()) {
    log.info("Install bootstrap disabled via ARCHIVIST_BOOTSTRAP_ON_INSTALL");
    return;
  }

  const { payload } = event;
  if (payload.action !== "created" && payload.action !== "unsuspend") return;

  const installationId = payload.installation.id;
  const repos =
    payload.repositories ||
    [];

  log.info("Installation event", {
    action: payload.action,
    installationId,
    repos: repos.length,
  });

  const app = createGitHubApp();
  const octokit = await getInstallationOctokit(app, installationId);

  for (const r of repos) {
    // full_name is "owner/repo"
    const [owner, name] = r.full_name.split("/");
    if (!owner || !name) continue;

    const repoId = String(r.id);

    await reviewQueue.run(async () => {
      try {
        await memoryStore.getOrCreate(repoId, r.full_name);
        const result = await bootstrapRepositoryMemory(
          octokit,
          owner,
          name,
          repoId,
          25
        );
        metrics.inc("bootstrapsCompleted");
        log.info("Install bootstrap done", {
          repo: r.full_name,
          ...result,
        });
      } catch (err) {
        log.error("Install bootstrap failed", {
          repo: r.full_name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

/**
 * When repos are added to an existing installation.
 */
export async function handleInstallationReposAdded(
  event: InstallationReposEvent
) {
  if (!bootstrapEnabled()) return;
  if (payloadAction(event) !== "added") return;

  const { payload } = event;
  const installationId = payload.installation.id;
  const repos = payload.repositories_added || [];

  log.info("Repositories added to installation", {
    installationId,
    repos: repos.map((r) => r.full_name),
  });

  const app = createGitHubApp();
  const octokit = await getInstallationOctokit(app, installationId);

  for (const r of repos) {
    const [owner, name] = r.full_name.split("/");
    if (!owner || !name) continue;
    const repoId = String(r.id);

    await reviewQueue.run(async () => {
      try {
        await memoryStore.getOrCreate(repoId, r.full_name);
        await bootstrapRepositoryMemory(octokit, owner, name, repoId, 25);
      } catch (err) {
        log.error("Repo-add bootstrap failed", {
          repo: r.full_name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

function payloadAction(event: InstallationReposEvent): string {
  return event.payload.action;
}
