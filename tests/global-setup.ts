import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { buildCreateUserSql, buildEmailSettingsSql } from "./seed-utils";
import { buildReviewFixtureSql } from "./e2e/review/fixture";
import { buildImagesFixtureSql } from "./e2e/review/images-fixture";
import { buildReferencesFixtureSql } from "./e2e/review/references-fixture";
import { buildRulesFixtureSql } from "./e2e/review/rules-fixture";
import { buildGithubFixtureSql } from "./e2e/github/fixture";
import { buildActivityFixtureSql } from "./e2e/review/activity-fixture";
import { RESET_USER, TEST_ADMIN, TEST_USER } from "./e2e/users";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "../apps/backend");

const PERSIST = "./.wrangler-test";

// Children before parents, so foreign keys never block a delete.
const TABLES = [
  "chat_messages",
  "chat_channels",
  "github_workflow_runs",
  "github_connections",
  "github_tokens",
  "pull_request_comments",
  "pull_request_reviews",
  "pull_request_commits",
  "transcripts",
  "review_marks",
  "pull_request_rules",
  "pull_request_groups",
  "pull_request_files",
  "pull_requests",
  "agent_sessions",
  "agent_repository_access",
  "repository_members",
  "repository_rules",
  "repositories",
  "agents",
  "api_keys",
  "instance_settings",
  "user_sessions",
  "user_accounts",
  "user_verifications",
  "user",
];

function runWrangler(args: string[]) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", ...args, "--local", "--persist-to", PERSIST],
    { cwd: backendDir, stdio: "inherit" },
  );
}

export default async function globalSetup() {
  console.log("[global-setup] applying migrations to test DB");
  runWrangler(["d1", "migrations", "apply", "DB"]);

  console.log("[global-setup] resetting test DB tables");
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--command",
    TABLES.map((table) => `DELETE FROM ${table};`).join(" "),
  ]);

  console.log("[global-setup] seeding the test admin and user");
  for (const user of [TEST_ADMIN, TEST_USER, RESET_USER]) {
    runWrangler([
      "d1",
      "execute",
      "DB",
      "--command",
      await buildCreateUserSql(user),
    ]);
  }

  console.log("[global-setup] turning email sending on");
  runWrangler(["d1", "execute", "DB", "--command", buildEmailSettingsSql()]);

  console.log("[global-setup] seeding a pull request to review");
  runWrangler(["d1", "execute", "DB", "--command", buildReviewFixtureSql()]);
  runWrangler(["d1", "execute", "DB", "--command", buildRulesFixtureSql()]);
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--command",
    buildReferencesFixtureSql(),
  ]);
  runWrangler(["d1", "execute", "DB", "--command", buildActivityFixtureSql()]);
  runWrangler(["d1", "execute", "DB", "--command", buildImagesFixtureSql()]);

  console.log("[global-setup] seeding a repository mirrored from GitHub");
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--command",
    await buildGithubFixtureSql(),
  ]);
}
