#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Copies or deletes every git repository in a deploy's Artifacts namespace, so
// a preview's git storage matches the staging D1 it was cloned from:
//
//   node scripts/artifacts-repos.mjs copy <from-namespace> <to-namespace>
//   node scripts/artifacts-repos.mjs clear <preview-namespace>
//
// Needs CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) for wrangler.
const TOKEN_TTL_SECONDS = 3600;

const [command, ...args] = process.argv.slice(2);
if (command === "copy" && args.length === 2) {
  copy(args[0], args[1]);
} else if (command === "clear" && args.length === 1) {
  clear(args[0]);
} else {
  console.error(
    "Usage: artifacts-repos.mjs copy <from> <to> | clear <preview-namespace>",
  );
  process.exit(2);
}

// A repository that fails to copy is reported and skipped: the preview still
// deploys, with that one repository missing its git data.
function copy(from, to) {
  const repos = reposIn(from);
  console.log(`Copying ${repos.length} repositories from ${from} to ${to}`);
  for (const repo of repos) {
    try {
      copyRepo(repo, from, to);
      console.log(`Copied ${repo.name}`);
    } catch (err) {
      console.log(
        `::warning::Could not copy git repository ${repo.name}: ${err.message}`,
      );
    }
  }
}

function copyRepo(repo, from, to) {
  const { remote: source } = wrangler([
    "repos",
    "get",
    repo.name,
    "--namespace",
    from,
  ]);
  const readToken = readTokenFor(repo.name, from);
  const created = wrangler([
    "repos",
    "create",
    repo.name,
    "--namespace",
    to,
    ...(repo.default_branch ? ["--default-branch", repo.default_branch] : []),
    ...(repo.description ? ["--description", repo.description] : []),
  ]);
  const writeToken = masked(created.token);
  const dir = mkdtempSync(join(tmpdir(), "artifacts-repo-"));
  try {
    git(readToken, ["clone", "--quiet", "--mirror", source, dir]);
    // A repository nobody pushed to has no refs, and nothing to push.
    if (git(null, ["-C", dir, "for-each-ref", "--count=1"]).trim()) {
      git(writeToken, [
        "-C",
        dir,
        "push",
        "--quiet",
        "--mirror",
        created.remote,
      ]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Refuses anything but a preview namespace: staging and production repositories
// are never deleted by script.
function clear(namespace) {
  if (!namespace.includes("-preview-")) {
    throw new Error(`Refusing to clear ${namespace}: not a preview namespace`);
  }
  const repos = reposIn(namespace);
  console.log(`Deleting ${repos.length} repositories from ${namespace}`);
  for (const repo of repos) {
    wrangler([
      "repos",
      "delete",
      repo.name,
      "--namespace",
      namespace,
      "--force",
    ]);
  }
}

// Artifacts creates a namespace with its first repository, so one that does
// not exist yet simply has none.
function reposIn(namespace) {
  const namespaces = wrangler(["namespaces", "list"]);
  return namespaces.some((n) => n.namespace === namespace)
    ? wrangler(["repos", "list", "--namespace", namespace])
    : [];
}

function readTokenFor(name, namespace) {
  const { plaintext } = wrangler([
    "repos",
    "issue-token",
    name,
    "--namespace",
    namespace,
    "--scope",
    "read",
    "--ttl",
    String(TOKEN_TTL_SECONDS),
  ]);
  return masked(plaintext);
}

// The workflow logs are public: keep every token out of them.
function masked(token) {
  console.log(`::add-mask::${token}`);
  return token;
}

function wrangler(args) {
  const out = execFileSync(
    "pnpm",
    [
      "--silent",
      "--filter",
      "@app/backend",
      "exec",
      "wrangler",
      "artifacts",
      ...args,
      "--json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out);
}

// The token goes in through the environment, never the command line, so a
// failed command's message cannot print it.
function git(token, args) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (token) {
    Object.assign(env, {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraHeader",
      GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
    });
  }
  return execFileSync("git", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}
