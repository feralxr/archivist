#!/usr/bin/env node
/**
 * Archivist CLI entry.
 * Prefers compiled dist/; falls back to tsx + TypeScript source for local dev.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distEntry = join(root, "dist", "cli", "index.js");
const srcEntry = join(root, "src", "cli", "index.ts");
const args = process.argv.slice(2);

if (existsSync(distEntry)) {
  // Compiled build — run as main module
  await import(pathToFileURL(distEntry).href);
} else if (existsSync(srcEntry)) {
  // Dev / post-clone without build — run via tsx
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const nodeArgs = existsSync(tsxCli)
    ? [tsxCli, srcEntry, ...args]
    : ["--import", "tsx", srcEntry, ...args];

  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
  process.exit(result.status ?? 1);
} else {
  console.error(
    "Archivist CLI not found. Run `npm install` and `npm run build` in the archivist package."
  );
  process.exit(1);
}
