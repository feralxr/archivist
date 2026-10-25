/**
 * Webhook delivery tracking for idempotency and retry awareness.
 *
 * GitHub redelivers on non-2xx responses (exponential backoff up to ~24h).
 * We must:
 *  1. Succeed only after work completes
 *  2. Ignore duplicate deliveries of the same X-GitHub-Delivery id
 *  3. Allow reprocessing if a prior attempt failed
 */

import { log } from "../core/logger.js";
import { metrics } from "../core/metrics.js";

export type DeliveryStatus = "processing" | "completed" | "failed";

interface DeliveryRecord {
  id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  lastError?: string;
  updatedAt: number;
}

const deliveries = new Map<string, DeliveryRecord>();
const TTL_MS = 24 * 60 * 60 * 1000; // align with GitHub retry window
const MAX_ENTRIES = 2_000;

function cleanup() {
  if (deliveries.size < MAX_ENTRIES) return;
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of deliveries) {
    if (v.updatedAt < cutoff) deliveries.delete(k);
  }
}

export function getDeliveryId(headers: Record<string, string | string[] | undefined>): string | null {
  const raw =
    headers["x-github-delivery"] ||
    headers["X-GitHub-Delivery"] ||
    headers["X-GitHub-Delivery".toLowerCase()];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

export function getEventName(headers: Record<string, string | string[] | undefined>): string {
  const raw =
    headers["x-github-event"] ||
    headers["X-GitHub-Event"] ||
    headers["X-GitHub-Event".toLowerCase()];
  if (!raw) return "unknown";
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Returns true if this delivery was already completed successfully.
 * Marks the delivery as processing otherwise.
 */
export function beginDelivery(id: string, event: string): { skip: boolean; attempts: number } {
  cleanup();
  const existing = deliveries.get(id);
  if (existing?.status === "completed") {
    metrics.inc("webhookDuplicates");
    log.info("Skipping duplicate webhook delivery", { id, event });
    return { skip: true, attempts: existing.attempts };
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  deliveries.set(id, {
    id,
    event,
    status: "processing",
    attempts,
    updatedAt: Date.now(),
    lastError: existing?.lastError,
  });

  if (attempts > 1) {
    metrics.inc("webhookRetries");
    log.info("Webhook redelivery / retry", { id, event, attempts });
  }

  return { skip: false, attempts };
}

export function completeDelivery(id: string) {
  const rec = deliveries.get(id);
  if (!rec) return;
  rec.status = "completed";
  rec.updatedAt = Date.now();
  rec.lastError = undefined;
  metrics.inc("webhookCompleted");
}

export function failDelivery(id: string, error: unknown) {
  const rec = deliveries.get(id);
  const message = error instanceof Error ? error.message : String(error);
  if (rec) {
    rec.status = "failed";
    rec.lastError = message.slice(0, 500);
    rec.updatedAt = Date.now();
  }
  metrics.inc("webhookFailures");
  log.warn("Webhook delivery failed — GitHub may retry", {
    id,
    attempts: rec?.attempts,
    error: message.slice(0, 300),
  });
}

export function deliveryStats() {
  let processing = 0;
  let completed = 0;
  let failed = 0;
  for (const d of deliveries.values()) {
    if (d.status === "processing") processing++;
    else if (d.status === "completed") completed++;
    else failed++;
  }
  return { tracked: deliveries.size, processing, completed, failed };
}
