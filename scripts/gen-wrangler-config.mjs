#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { environmentFor } from "./lib/environments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "../apps/backend");
const migrationsDir = resolve(here, "../migrations");

// Stamps per-target overrides onto the config emitted by `pnpm build` (run it
// first). DB_ID is required because `wrangler d1 migrations apply --remote`
// needs a database_id in config, and wrangler.jsonc deliberately has none.
const target = requireEnv("TARGET");
const environment = environmentFor(target);
const OVERRIDES = {
  // WORKER_NAME renames the Worker; scripts/deploy-production.mjs passes the
  // name from the root wrangler.jsonc, which the Deploy button may have changed.
  name: process.env.WORKER_NAME || environment.workerName,
  databaseName: requireEnv("DB_NAME"),
  databaseId: requireEnv("DB_ID"),
  frontendCanonicalBaseUrl: origin(requireEnv("DEPLOY_ORIGIN")),
  authAllowedHosts: environment.allowedHosts.join(","),
  outFile: environment.outFile,
};

function main() {
  const source = emittedConfigPath();
  const config = JSON.parse(readFileSync(source, "utf8"));
  // Must sit beside the emitted config: its main/assets.directory are relative.
  const out = resolve(dirname(source), OVERRIDES.outFile);

  config.name = OVERRIDES.name;
  delete config.env;
  config.d1_databases = [
    {
      binding: "DB",
      database_name: OVERRIDES.databaseName,
      database_id: OVERRIDES.databaseId,
      // Relative to the generated config file, not apps/backend.
      migrations_dir: relative(dirname(out), migrationsDir),
    },
  ];
  config.vars = {
    ...config.vars,
    FRONTEND_CANONICAL_BASE_URL: OVERRIDES.frontendCanonicalBaseUrl,
    AUTH_ALLOWED_HOSTS: OVERRIDES.authAllowedHosts,
    // Every remote target (preview/staging/prod) runs in production mode. Local
    // dev and e2e run from wrangler.jsonc and deliberately leave this unset.
    NODE_ENV: "production",
  };
  // Every target hosts git, keeping its data in its own namespace named after
  // its database, so a preview never sees production repositories. The
  // namespace is created on first use.
  config.artifacts = [
    { binding: "ARTIFACTS", namespace: OVERRIDES.databaseName },
  ];
  // Server-side processing (Admin > Agent config): the model, and the Worker
  // Loader its sandbox runs in. The PROCESSING Durable Object comes from
  // wrangler.jsonc. Admins still choose whether to use it; agents group until
  // they do.
  config.ai = { binding: "AI" };
  config.worker_loaders = [{ binding: "LOADER" }];
  // Remote targets read BETTER_AUTH_SECRET and SETUP_TOKEN from worker secrets
  // (wrangler secret put).
  delete config.vars.BETTER_AUTH_SECRET;
  delete config.vars.SETUP_TOKEN;
  // The build emits an empty `migrations` beside `exports`; Cloudflare refuses
  // a config with both.
  if (config.migrations?.length === 0) {
    delete config.migrations;
  }
  if (target === "preview") {
    config.previews = previewsBlock(config);
  }
  // Worker Previews get their <name>-<worker>.<subdomain>.workers.dev URL only
  // while the Worker has Preview URLs on. A new Worker starts with them off
  // and `wrangler preview` cannot turn them on, so the staging deploy, which
  // owns the Worker, asks for them on every run.
  if (target === "staging") {
    config.preview_urls = true;
  }
  // Production served on workers.dev needs that address on. Left to wrangler's
  // default, a Worker deployed by the Deploy button came up without it.
  if (
    target === "production" &&
    new URL(OVERRIDES.frontendCanonicalBaseUrl).hostname.endsWith(
      ".workers.dev",
    )
  ) {
    config.workers_dev = true;
  }

  writeFileSync(out, JSON.stringify(config, null, 2) + "\n");
  console.log(
    `Wrote ${out} (target=${target}, name=${config.name}, db=${OVERRIDES.databaseName}, canonical=${OVERRIDES.frontendCanonicalBaseUrl}, allowed_hosts=${OVERRIDES.authAllowedHosts}, artifacts=${OVERRIDES.databaseName})`,
  );
}

// A Worker Preview (`wrangler preview`) inherits none of the Worker's own
// bindings or vars, so the preview target repeats them here. Durable Object
// classes and migrations stay top-level; each preview gets its own namespace.
// Secrets come from the Previews base config (see docs/deployment.md).
function previewsBlock(config) {
  return {
    vars: config.vars,
    d1_databases: config.d1_databases,
    artifacts: config.artifacts,
    send_email: config.send_email,
    durable_objects: config.durable_objects,
    ai: config.ai,
    worker_loaders: config.worker_loaders,
  };
}

// Rejects an origin built from an unset variable (e.g. "https://").
function origin(value) {
  try {
    return new URL(value).origin;
  } catch {
    console.error(`DEPLOY_ORIGIN "${value}" is not a URL`);
    process.exit(1);
  }
}

// `vite build` leaves this redirect to the emitted config (wrangler follows it too).
function emittedConfigPath() {
  const redirectFile = resolve(backendDir, ".wrangler/deploy/config.json");
  let redirect;
  try {
    redirect = JSON.parse(readFileSync(redirectFile, "utf8"));
  } catch {
    console.error(
      `Could not read ${redirectFile}. Run \`pnpm build\` first — the vite build emits the worker config this stamps.`,
    );
    process.exit(1);
  }
  return resolve(dirname(redirectFile), redirect.configPath);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

main();
