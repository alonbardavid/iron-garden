#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import ts from "typescript";

// Deploys the production instance described by the root wrangler.jsonc: the
// path the Deploy to Cloudflare button (Workers Builds) and a local
// `pnpm run deploy` take. Run `pnpm build` first.
//
//   node scripts/deploy-production.mjs config   # generate the deploy config
//   node scripts/deploy-production.mjs migrate  # ...and apply D1 migrations
//   node scripts/deploy-production.mjs deploy   # ...and deploy the Worker
//
// The origin is https://$PROD_HOST when set, else the Worker's workers.dev
// address, which needs CLOUDFLARE_API_TOKEN (Workers Builds provides one).
// The first deploy generates BETTER_AUTH_SECRET.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const GENERATED = "dist/worker/wrangler.generated.production.json";
const STEPS = ["config", "migrate", "deploy"];
const GENERATED_SECRETS = ["BETTER_AUTH_SECRET"];

async function main() {
  const step = process.argv[2] ?? "deploy";
  if (!STEPS.includes(step)) {
    fail(`Unknown step "${step}". Expected one of: ${STEPS.join(", ")}`);
  }
  const instance = readInstance();
  const databaseId = resolveDatabase(instance);
  const origin = process.env.PROD_HOST
    ? `https://${process.env.PROD_HOST}`
    : await workersDevOrigin(instance.name);

  run("node", [resolve(here, "gen-wrangler-config.mjs")], {
    env: {
      ...process.env,
      TARGET: "production",
      WORKER_NAME: instance.name,
      DB_NAME: instance.databaseName,
      DB_ID: databaseId,
      DEPLOY_ORIGIN: origin,
    },
  });
  if (step === "config") {
    return;
  }
  // Checked before migrating, so a failed check changes nothing.
  const secretsFile =
    step === "deploy" ? generatedSecretsFile(instance.name) : null;
  wrangler([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    GENERATED,
  ]);
  if (step === "deploy") {
    wrangler([
      "deploy",
      "--config",
      GENERATED,
      ...(secretsFile ? ["--secrets-file", secretsFile] : []),
    ]);
  }
}

// A file of random values for the secrets the Worker lacks, uploaded with the
// version so it never runs without them; none once they are set, and
// --secrets-file leaves the ones it omits alone. Only a Worker that does not
// exist yet counts as lacking them: any other failure to list them stops the
// deploy, because overwriting BETTER_AUTH_SECRET signs everyone out and makes
// every stored GitHub token unreadable.
function generatedSecretsFile(workerName) {
  const result = spawnSync(
    "pnpm",
    [
      "--silent",
      "--filter",
      "@app/backend",
      "exec",
      "wrangler",
      "secret",
      "list",
      "--name",
      workerName,
      "--format",
      "json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  let existing;
  if (result.status === 0) {
    existing = JSON.parse(result.stdout).map((secret) => secret.name);
  } else if (result.stderr.includes(`Worker "${workerName}" not found`)) {
    existing = [];
  } else {
    process.stderr.write(result.stderr);
    fail(`Could not list the secrets of ${workerName}`);
  }
  const missing = GENERATED_SECRETS.filter((name) => !existing.includes(name));
  if (missing.length === 0) {
    return null;
  }
  const dir = mkdtempSync(join(tmpdir(), "deploy-secrets-"));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "secrets.json");
  const values = Object.fromEntries(
    missing.map((name) => [name, randomBytes(32).toString("hex")]),
  );
  writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
  console.log(`Generating ${missing.join(", ")} for ${workerName}`);
  return file;
}

// The Worker name and D1 database from the root wrangler.jsonc, which the
// Deploy button rewrites with the names and database id chosen there.
function readInstance() {
  const path = resolve(root, "wrangler.jsonc");
  const { config, error } = ts.parseConfigFileTextToJson(
    path,
    readFileSync(path, "utf8"),
  );
  if (error) {
    fail(`Could not parse ${path}`);
  }
  const database = config.d1_databases?.find((db) => db.binding === "DB");
  if (!config.name || !database?.database_name) {
    fail(`${path} must set "name" and a D1 database bound as DB`);
  }
  return {
    name: config.name,
    databaseName: database.database_name,
    databaseId: database.database_id,
  };
}

// The configured database_id when it exists, else the database of that name,
// created on the first deploy. The committed id is a placeholder the Deploy
// button replaces; a clone deployed by hand starts from it too.
function resolveDatabase({ databaseName, databaseId }) {
  const find = () => {
    const databases = JSON.parse(wrangler(["d1", "list", "--json"], true));
    return (
      databases.find((db) => db.uuid === databaseId) ??
      databases.find((db) => db.name === databaseName)
    );
  };
  let database = find();
  if (!database) {
    console.log(`Creating D1 database ${databaseName}`);
    wrangler(["d1", "create", databaseName]);
    database = find();
  }
  if (!database) {
    fail(`D1 database ${databaseName} could not be found or created`);
  }
  console.log(`Using D1 database ${database.name} (${database.uuid})`);
  return database.uuid;
}

async function workersDevOrigin(workerName) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    fail(
      "Set PROD_HOST to the production hostname, or CLOUDFLARE_API_TOKEN to serve on workers.dev",
    );
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || (await soleAccount());
  const { subdomain } = await cloudflare(
    `/accounts/${accountId}/workers/subdomain`,
  );
  if (!subdomain) {
    fail("The account has no workers.dev subdomain; set PROD_HOST instead");
  }
  return `https://${workerName}.${subdomain}.workers.dev`;
}

async function soleAccount() {
  const accounts = await cloudflare("/accounts?per_page=50");
  if (accounts.length !== 1) {
    fail(
      `The API token sees ${accounts.length} accounts; set CLOUDFLARE_ACCOUNT_ID to pick one`,
    );
  }
  return accounts[0].id;
}

async function cloudflare(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    fail(`Cloudflare API ${path} answered HTTP ${response.status}`);
  }
  return body.result;
}

// Wrangler runs from apps/backend, where it is installed.
function wrangler(args, capture = false) {
  return run(
    "pnpm",
    ["--silent", "--filter", "@app/backend", "exec", "wrangler", ...args],
    { capture },
  );
}

function run(command, args, { env = process.env, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return result.stdout;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

await main();
