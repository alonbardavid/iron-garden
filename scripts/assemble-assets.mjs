#!/usr/bin/env node
import { rm, cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Must run before `vite build`, which copies apps/backend/public into the
// worker's static assets.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const target = resolve(root, "apps/backend/public");
const mainBuild = resolve(root, "apps/frontend/dist/public");

async function main() {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(mainBuild, target, { recursive: true });
  console.log(`Staged assets in ${target}`);
}

main().catch((err) => {
  console.error("Failed to assemble assets:", err.message);
  process.exit(1);
});
