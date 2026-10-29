import { createHash } from "node:crypto";
import { changesOf, diffLines, type Change, type DiffLine } from "@lib/diff";
import { newEntityId } from "@lib/db-models/entity-ids";
import { deriveKey, encrypt } from "@lib/github/crypto";
import {
  baseFile,
  blockOf,
  changedFiles,
  fileAt,
  linesOf,
  wholeFile,
} from "./demo";
import { MAYA, REPOSITORY, SAM } from "./shared";

// What git storage and the worker would have stored for the demo, seeded
// straight into the database as the e2e fixtures do: repositories, sessions,
// and pull requests with their changes, brackets, rule matches, commits and
// transcripts. People, agents and keys come from the API first.

export const SESSIONS = {
  refunds: "SES_DEMO_REFUNDS",
  dunning: "SES_DEMO_DUNNING",
  lateFees: "SES_DEMO_LATE_FEES",
  readme: "SES_DEMO_README",
  spike: "SES_DEMO_SPIKE",
};
export const PULL_REQUESTS = {
  refunds: 1,
  readme: 2,
  lateFees: 3,
  taxRounding: 4,
  darkMode: 1,
};
export const DASHBOARD = "web-dashboard";
const REFUNDS_PR = "PR_DEMO_REFUNDS";

export async function buildDemoSql(): Promise<string> {
  const ids = {
    billing: newEntityId("REPOSITORY"),
    dashboard: newEntityId("REPOSITORY"),
    infra: newEntityId("REPOSITORY"),
  };
  return [
    ...repositories(ids),
    ...sessions(ids.billing),
    ...refundsPullRequest(ids.billing),
    ...readmePullRequest(ids.billing),
    ...lateFeesPullRequest(ids.billing),
    ...taxRoundingPullRequest(ids.billing),
    ...unmergedSpike(ids.billing),
    ...(await dashboardOnGithub(ids.dashboard)),
    ...dashboardRules(ids.dashboard),
  ].join("\n");
}

function repositories(ids: {
  billing: string;
  dashboard: string;
  infra: string;
}) {
  const repository = (
    id: string,
    name: string,
    description: string,
    owner: string,
    age: number,
  ) =>
    `INSERT INTO repositories (id, name, description, artifacts_name, created_by, created_at) VALUES ('${id}', '${name}', ${sql(description)}, '${id}', ${user(owner)}, ${minutesAgo(age)});`;
  return [
    repository(
      ids.billing,
      REPOSITORY,
      "Invoices, credits and payments for Acme customers",
      MAYA.username,
      20000,
    ),
    repository(
      ids.dashboard,
      DASHBOARD,
      "The customer dashboard",
      MAYA.username,
      15000,
    ),
    repository(
      ids.infra,
      "infra",
      "Terraform and deploy scripts",
      SAM.username,
      9000,
    ),
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${ids.billing}', ${user(MAYA.username)}, 'admin'), ('${ids.billing}', ${user(SAM.username)}, 'write'), ('${ids.dashboard}', ${user(MAYA.username)}, 'admin'), ('${ids.dashboard}', ${user(SAM.username)}, 'read'), ('${ids.infra}', ${user(SAM.username)}, 'admin'), ('${ids.infra}', ${user(MAYA.username)}, 'read');`,
    `INSERT INTO agent_repository_access (agent_id, repository_id, level) VALUES (${agent(CLAUDE)}, '${ids.billing}', 'write'), (${agent(CLAUDE)}, '${ids.dashboard}', 'read'), (${agent(CODEX)}, '${ids.billing}', 'write');`,
  ];
}

export const CLAUDE = "claude-laptop";
export const CODEX = "codex-runner";

function sessions(repo: string) {
  const session = (
    id: string,
    by: string,
    title: string,
    goal: string,
    status: "active" | "ended",
    lastSeen: number,
    started: number,
    client: string | null,
  ) =>
    `INSERT INTO agent_sessions (id, agent_id, repository_id, title, goal, status, artifacts_name, base_branch, base_commit, client, last_seen_at, ended_at, created_at) VALUES ('${id}', ${agent(by)}, '${repo}', ${sql(title)}, ${sql(goal)}, '${status}', '${id}', 'main', '${BASE_COMMIT}', ${client ? sql(client) : "NULL"}, ${lastSeen}, ${status === "ended" ? lastSeen : "NULL"}, ${started});`;
  return [
    session(
      SESSIONS.refunds,
      CLAUDE,
      "Refunds endpoint",
      "Let support refund part of an invoice.",
      "active",
      minutesAgo(2),
      minutesAgo(190),
      "claude-code",
    ),
    session(
      SESSIONS.dunning,
      CLAUDE,
      "Dunning emails",
      "Email customers about overdue invoices.",
      "active",
      minutesAgo(1),
      minutesAgo(40),
      "claude-code",
    ),
    session(
      SESSIONS.lateFees,
      CODEX,
      "Late fees",
      "Charge a late fee on invoices 30 days overdue.",
      "active",
      minutesAgo(25),
      minutesAgo(70),
      null,
    ),
    session(
      SESSIONS.readme,
      CODEX,
      "Endpoint docs",
      "List the endpoints in the README.",
      "ended",
      minutesAgo(600),
      minutesAgo(700),
      null,
    ),
    session(
      SESSIONS.spike,
      CODEX,
      "PDF invoices spike",
      "Try rendering invoices as PDF.",
      "ended",
      minutesAgo(1500),
      minutesAgo(1600),
      null,
    ),
  ];
}

// The showcase: one bracket per kind of change, rules that auto-accept the
// lockfile and import lines, ask for a review of migrations and flag money
// handling as high impact.
function refundsPullRequest(repo: string) {
  const files = changedFiles().map((f) => ({
    ...f,
    changes: changes(f.before, f.after),
  }));
  const { rules, matches, moneyRanges } = refundsRules(files);
  return [
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, title, description, branch, target_branch, base_commit, head_commit, status, created_at) VALUES ('${REFUNDS_PR}', '${repo}', ${PULL_REQUESTS.refunds}, '${SESSIONS.refunds}', ${agent(CLAUDE)}, 'Add partial refunds', ${sql(REFUNDS_DESCRIPTION)}, 'refunds', 'main', '${BASE_COMMIT}', '${COMMITS[2]!.sha}', 'open', ${minutesAgo(95)});`,
    ...files.map(
      (f) =>
        `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes, matches) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${REFUNDS_PR}', '${f.path}', '${f.change}', ${lineCount(f.before)}, ${lineCount(f.after)}, ${sql(f.changes.map((c) => [c.key, c.at]))}, ${sql(matches(f.path))});`,
    ),
    ...Object.values(rules).flatMap((r, position) => [
      `INSERT INTO repository_rules (id, repository_id, name, match, action, reviewers) VALUES ('${r.id}', '${repo}', ${sql(r.name)}, ${sql(r.match)}, '${r.action}', ${r.reviewers});`,
      `INSERT INTO pull_request_rules (id, pull_request_id, rule_id, position, name, match, action, reviewers, ranges, matched) VALUES ('${r.run}', '${REFUNDS_PR}', '${r.id}', ${position}, ${sql(r.name)}, ${sql(r.match)}, '${r.action}', ${r.reviewers}, ${r === rules.money ? sql(moneyRanges) : "NULL"}, 1);`,
    ]),
    `INSERT INTO repository_rules (id, repository_id, name, match, action) VALUES ('${newEntityId("REPOSITORY_RULE")}', '${repo}', 'One schema change at a time', ${sql({ kind: "files", syntax: "glob", patterns: ["migrations/**"] })}, 'mark-exclusive');`,
    ...REFUNDS_GROUPS().map(
      (g, position) =>
        `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, description, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${REFUNDS_PR}', ${position}, ${sql(g.title)}, '${g.kind}', ${g.description ? sql(g.description) : "NULL"}, ${sql(g.ranges)});`,
    ),
    ...COMMITS.flatMap((c, position) => [
      `INSERT INTO pull_request_commits (id, pull_request_id, position, sha, message, author_name, committed_at, transcript_ref) VALUES ('${newEntityId("PULL_REQUEST_COMMIT")}', '${REFUNDS_PR}', ${position}, '${c.sha}', ${sql(c.message)}, 'Claude', ${c.at}, NULL);`,
      `INSERT INTO transcripts (id, session_id, commit_sha, source, entries, created_at) VALUES ('${newEntityId("TRANSCRIPT")}', '${SESSIONS.refunds}', '${c.sha}', 'api', ${sql(c.transcript)}, ${c.at});`,
    ]),
    ...files.map(
      (f) =>
        `INSERT INTO session_files (id, session_id, repository_id, path, source, branch, touched_at) VALUES ('${newEntityId("SESSION_FILE")}', '${SESSIONS.refunds}', '${repo}', '${f.path}', 'committed', 'refunds', ${minutesAgo(95)});`,
    ),
    `INSERT INTO session_branches (id, session_id, branch, head_commit, merge_base) VALUES ('${newEntityId("SESSION_BRANCH")}', '${SESSIONS.refunds}', 'refunds', '${COMMITS[2]!.sha}', '${BASE_COMMIT}');`,
  ];
}

type SeededFile = ReturnType<typeof changedFiles>[number] & {
  changes: ReturnType<typeof changes>;
};

// The repository's rules and what each matched in the showcase, as the worker
// would store them: pattern rules by key, the prompt rule as the agent's ranges.
function refundsRules(files: SeededFile[]) {
  const keysOf = (
    path: string,
    pick: (texts: string[]) => boolean = () => true,
  ) =>
    files
      .find((f) => f.path === path)!
      .changes.filter((c) => pick(c.texts))
      .map((c) => c.key);
  const rules = {
    lockfiles: rule(
      "Lockfiles",
      { kind: "files", syntax: "glob", patterns: ["pnpm-lock.yaml"] },
      "auto-accept",
    ),
    imports: rule(
      "Import lines",
      { kind: "structure", constructs: ["imports"], paths: ["src/**"] },
      "auto-accept",
    ),
    migrations: rule(
      "Database migrations",
      { kind: "files", syntax: "glob", patterns: ["migrations/**"] },
      "require-review",
      [MAYA.username],
    ),
    money: rule(
      "Money handling",
      {
        kind: "prompt",
        prompt: "Code that computes, parses or compares amounts of money",
        paths: ["src/**"],
      },
      "high-impact",
    ),
  };
  const importLine = (texts: string[]) =>
    texts.length > 0 && texts.every((t) => t.startsWith("import "));
  const matches = (path: string): Record<string, string[]> => {
    if (path === "pnpm-lock.yaml")
      return { [rules.lockfiles.run]: keysOf(path) };
    if (path.startsWith("migrations/"))
      return { [rules.migrations.run]: keysOf(path) };
    if (!path.startsWith("src/")) return {};
    const imports = keysOf(path, importLine);
    return imports.length ? { [rules.imports.run]: imports } : {};
  };
  const moneyRanges = [
    range(
      "src/routes/refunds.ts",
      fileAt("src/routes/refunds.ts"),
      "if (invoice && body.amountCents",
      "refund_exceeds_invoice",
    ),
    {
      path: "src/lib/money.ts",
      ...blockOf(fileAt("src/lib/money.ts"), "export function parseMoney"),
    },
  ];
  return { rules, matches, moneyRanges };
}

// Sam's agent documented the endpoints; Maya reviewed and merged it.
function readmePullRequest(repo: string) {
  const before = baseFile("README.md");
  const after = `${before}\n## Endpoints\n\n- \`GET /v1/customers/:id/invoices\`\n- \`GET /v1/customers/:id/credits\`\n- \`POST /v1/customers/:id/credits\`\n`;
  const id = newEntityId("PULL_REQUEST");
  const keys = changes(before, after).map((c) => [c.key, c.at]);
  return [
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, title, branch, target_branch, base_commit, head_commit, status, created_at) VALUES ('${id}', '${repo}', ${PULL_REQUESTS.readme}, '${SESSIONS.readme}', ${agent(CODEX)}, 'Document the endpoints', 'readme-endpoints', 'main', '${BASE_COMMIT}', '${sha("readme")}', 'merged', ${minutesAgo(650)});`,
    `UPDATE pull_requests SET merge_method = 'squash', merge_commit = '${sha("readme-merge")}', merged_by = ${user(MAYA.username)}, closed_at = ${minutesAgo(610)} WHERE id = '${id}';`,
    `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${id}', 'README.md', 'modified', ${lineCount(before)}, ${lineCount(after)}, ${sql(keys)});`,
    `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${id}', 0, 'Endpoint list in the README', 'docs', ${sql([range("README.md", after, "## Endpoints", "POST /v1")])});`,
  ];
}

// Still being grouped.
function lateFeesPullRequest(repo: string) {
  const id = newEntityId("PULL_REQUEST");
  const after =
    "export const LATE_FEE_CENTS = 1500;\nexport const LATE_AFTER_DAYS = 30;\n";
  const keys = changes("", after).map((c) => [c.key, c.at]);
  return [
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, title, branch, target_branch, base_commit, head_commit, status, created_at) VALUES ('${id}', '${repo}', ${PULL_REQUESTS.lateFees}, '${SESSIONS.lateFees}', ${agent(CODEX)}, 'Charge late fees', 'late-fees', 'main', '${BASE_COMMIT}', '${sha("late")}', 'processing', ${minutesAgo(26)});`,
    `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${id}', 'src/services/late-fees.ts', 'added', 0, 2, ${sql(keys)});`,
  ];
}

// An ended session that left a branch with no pull request.
function unmergedSpike(repo: string) {
  return [
    `INSERT INTO session_branches (id, session_id, branch, head_commit, merge_base) VALUES ('${newEntityId("SESSION_BRANCH")}', '${SESSIONS.spike}', 'spike-pdf', '${sha("spike")}', '${BASE_COMMIT}');`,
    `INSERT INTO session_files (id, session_id, repository_id, path, source, branch, touched_at) VALUES ('${newEntityId("SESSION_FILE")}', '${SESSIONS.spike}', '${repo}', 'src/pdf/render.ts', 'committed', 'spike-pdf', ${minutesAgo(1500)});`,
  ];
}

// Bracketed on the server, which gave up; the reason shows on the pull request.
function taxRoundingPullRequest(repo: string) {
  const id = newEntityId("PULL_REQUEST");
  const after =
    "export const roundTax = (cents: number) => Math.round(cents);\n";
  const keys = changes("", after).map((c) => [c.key, c.at]);
  return [
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, title, branch, target_branch, base_commit, head_commit, status, grouped_by, processing_error, created_at) VALUES ('${id}', '${repo}', ${PULL_REQUESTS.taxRounding}, '${SESSIONS.lateFees}', ${agent(CODEX)}, 'Round tax per line', 'tax-rounding', 'main', '${BASE_COMMIT}', '${sha("tax")}', 'open', 'server', ${sql("The model's brackets left out src/lib/tax.ts lines 1–1, after 3 answers.")}, ${minutesAgo(15)});`,
    `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${id}', 'src/lib/tax.ts', 'added', 0, 1, ${sql(keys)});`,
  ];
}

// The dashboard mirrors acme/web-dashboard on GitHub, with Maya's tokens, a
// hook set up, workflow runs, and a pull request for the GitHub merge.
async function dashboardOnGithub(repo: string) {
  const key = await deriveKey(INSTANCE_SECRET);
  const classic = newEntityId("GITHUB_TOKEN");
  const fineGrained = newEntityId("GITHUB_TOKEN");
  const connection = newEntityId("GITHUB_CONNECTION");
  const session = "SES_DEMO_DARK_MODE";
  const pr = newEntityId("PULL_REQUEST");
  const after = 'export const THEMES = ["light", "dark"] as const;\n';
  const runs = [
    ["CI", 412, "push", "main", "completed", "success", 30],
    ["CI", 413, "pull_request", "dark-mode", "completed", "failure", 22],
    [
      "Deploy preview",
      88,
      "pull_request",
      "dark-mode",
      "completed",
      "success",
      21,
    ],
    ["CI", 414, "pull_request", "dark-mode", "in_progress", null, 3],
    ["Nightly e2e", 57, "schedule", "main", "completed", "success", 480],
  ] as const;
  return [
    `INSERT INTO github_tokens (id, user_id, name, token_ciphertext, token_hint, github_login, scopes, expires_at, last_used_at, created_at) VALUES ('${classic}', ${user(MAYA.username)}, 'acme org', '${await encrypt(key, "ghp_demo_not_a_real_token")}', 'k3Qz', 'maya-acme', 'repo, workflow', NULL, ${minutesAgo(30)}, ${minutesAgo(14000)});`,
    `INSERT INTO github_tokens (id, user_id, name, token_ciphertext, token_hint, github_login, scopes, expires_at, last_used_at, created_at) VALUES ('${fineGrained}', ${user(MAYA.username)}, 'billing only', '${await encrypt(key, "github_pat_demo_not_a_real_token")}', 'x7Pd', 'maya-acme', NULL, ${minutesAgo(-60 * 24 * 60)}, NULL, ${minutesAgo(3000)});`,
    `INSERT INTO github_connections (id, repository_id, owner, repo, token_id, webhook_secret_ciphertext, webhook_id, webhook_delivered_at, sync_status, last_synced_at, created_by) VALUES ('${connection}', '${repo}', 'acme', 'web-dashboard', '${classic}', '${await encrypt(key, "demo-webhook-secret-0123456789")}', 51234, ${minutesAgo(3)}, 'idle', ${minutesAgo(3)}, ${user(MAYA.username)});`,
    ...runs.map(
      ([name, number, event, branch, status, conclusion, age], i) =>
        `INSERT INTO github_workflow_runs (id, repository_id, run_id, workflow_name, run_number, run_attempt, event, head_branch, head_sha, status, conclusion, html_url, started_at, github_updated_at) VALUES ('${newEntityId("GITHUB_WORKFLOW_RUN")}', '${repo}', ${9000 + i}, '${name}', ${number}, 1, '${event}', '${branch}', '${sha(`run${i}`)}', '${status}', ${conclusion ? `'${conclusion}'` : "NULL"}, 'https://github.com/acme/web-dashboard/actions/runs/${9000 + i}', ${minutesAgo(age)}, ${minutesAgo(age - 2)});`,
    ),
    `INSERT INTO agent_sessions (id, agent_id, repository_id, title, goal, status, artifacts_name, base_branch, base_commit, client, last_seen_at, created_at) VALUES ('${session}', ${agent(CLAUDE)}, '${repo}', 'Dark mode', 'Add a dark theme.', 'active', '${session}', 'main', '${BASE_COMMIT}', 'claude-code', ${minutesAgo(4)}, ${minutesAgo(60)});`,
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, title, branch, target_branch, base_commit, head_commit, status, created_at) VALUES ('${pr}', '${repo}', ${PULL_REQUESTS.darkMode}, '${session}', ${agent(CLAUDE)}, 'Add a dark theme', 'dark-mode', 'main', '${BASE_COMMIT}', '${sha("dark")}', 'open', ${minutesAgo(50)});`,
    `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${pr}', 'src/theme.ts', 'added', 0, 1, ${sql(changes("", after).map((c) => [c.key, c.at]))});`,
    `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${pr}', 0, 'Theme list', 'flow', ${sql([{ path: "src/theme.ts", start: 1, end: 1 }])});`,
  ];
}

// Rules worth copying into another repository.
function dashboardRules(repo: string) {
  const add = (name: string, match: object, action: string) =>
    `INSERT INTO repository_rules (id, repository_id, name, match, action) VALUES ('${newEntityId("REPOSITORY_RULE")}', '${repo}', ${sql(name)}, ${sql(match)}, '${action}');`;
  return [
    add(
      "Lockfiles",
      { kind: "files", syntax: "glob", patterns: ["pnpm-lock.yaml"] },
      "auto-accept",
    ),
    add(
      "Generated icons",
      { kind: "files", syntax: "glob", patterns: ["src/icons/generated/**"] },
      "auto-accept",
    ),
    add(
      "Auth checks",
      {
        kind: "prompt",
        prompt:
          "Changes to who may see or do what: permission and session checks",
        paths: ["src/**"],
      },
      "high-impact",
    ),
  ];
}

// The local-dev BETTER_AUTH_SECRET (apps/backend/wrangler.jsonc), which the
// worker derives the key for GitHub secrets from.
const INSTANCE_SECRET = "local-dev-secret-please-change-3f9a1c7d8e2b4506";

const REFUNDS_DESCRIPTION = [
  "Support can refund part of an invoice with `POST /v1/invoices/:id/refunds`.",
  "",
  "- A `refunds` table, one row per refund",
  "- Refunds above the invoice total are refused with 409",
  "- `formatMoney` moves to `lib/money`, and the http helpers become `http-errors`",
  "- The legacy CSV export goes; reports replaced it",
].join("\n");

// One bracket per kind of change; import lines and the lockfile are left to
// the auto-accept rules.
const REFUNDS_GROUPS = () => {
  const refunds = fileAt("src/routes/refunds.ts");
  const money = fileAt("src/lib/money.ts");
  const http = fileAt("src/lib/http-errors.ts");
  const invoicesService = fileAt("src/services/invoices.ts");
  return [
    {
      title: "Refund endpoint",
      kind: "flow",
      description:
        "Validates the amount like credits do, refuses refunds above the invoice total, and stores the refund.",
      ranges: [
        {
          path: "src/routes/refunds.ts",
          ...blockOf(refunds, "refunds.post("),
          note: "Modelled on the credits endpoint; adds the invoice-total check.",
          reference: {
            path: "src/routes/credits.ts",
            ...blockOf(baseFile("src/routes/credits.ts"), "credits.post("),
          },
        },
        {
          ...range(
            "src/routes/invoices.ts",
            fileAt("src/routes/invoices.ts"),
            "loadInvoices(c.var.db",
            "refunded:",
          ),
          note: "Invoices show what was refunded.",
        },
        range(
          "src/index.ts",
          fileAt("src/index.ts"),
          'app.route("/", refunds)',
        ),
      ],
    },
    {
      title: "Money formatting moves to lib/money",
      kind: "move",
      description:
        "`formatMoney` moves and takes a locale; `parseMoney` is new.",
      ranges: [
        {
          path: "src/lib/money.ts",
          ...blockOf(money, "export function formatMoney"),
          movedFrom: {
            path: "src/services/invoices.ts",
            ...blockOf(
              baseFile("src/services/invoices.ts"),
              "export function formatMoney",
            ),
          },
        },
        {
          path: "src/lib/money.ts",
          ...blockOf(money, "export function parseMoney"),
          note: "New: parses a formatted amount back to cents.",
        },
        {
          path: "src/services/invoices.ts",
          start: lineCount(invoicesService),
          end: lineCount(invoicesService),
          note: "Where formatMoney was.",
        },
      ],
    },
    {
      title: "HTTP helpers renamed to http-errors",
      kind: "rename",
      description:
        "The same helpers under a clearer name, plus `conflict` for 409 responses.",
      ranges: [
        {
          path: "src/lib/http-errors.ts",
          ...wholeFile(baseFile("src/lib/http.ts")),
          movedFrom: {
            path: "src/lib/http.ts",
            ...wholeFile(baseFile("src/lib/http.ts")),
          },
        },
        {
          path: "src/lib/http-errors.ts",
          ...blockOf(http, "export function conflict"),
        },
        { path: "src/lib/http.ts", ...wholeFile(baseFile("src/lib/http.ts")) },
      ],
    },
    {
      title: "Refunds table",
      kind: "schema",
      ranges: [
        range(
          "migrations/0002_refunds.sql",
          fileAt("migrations/0002_refunds.sql"),
          "CREATE TABLE refunds",
          "CREATE INDEX",
        ),
      ],
    },
    {
      title: "Refund tests",
      kind: "tests",
      ranges: [
        {
          path: "test/refunds.test.ts",
          ...wholeFile(fileAt("test/refunds.test.ts")),
        },
      ],
    },
    {
      title: "Legacy CSV export removed",
      kind: "other",
      description: "Finance moved to the reports service.",
      ranges: [
        {
          path: "src/legacy/export-csv.ts",
          ...wholeFile(baseFile("src/legacy/export-csv.ts")),
        },
      ],
    },
    {
      title: "Dependencies, diagram and icon",
      kind: "config",
      ranges: [
        {
          ...range("package.json", fileAt("package.json"), '"hono"', '"zod"'),
          note: "zod, for request validation.",
        },
        {
          path: "docs/architecture.png",
          start: 1,
          end: 1,
          note: "The diagram gains the refunds box.",
        },
        {
          path: "public/favicon.svg",
          ...wholeFile(fileAt("public/favicon.svg")),
          note: "The new rounded icon.",
        },
      ],
    },
  ];
};

const COMMITS = [
  {
    sha: sha("c1"),
    at: minutesAgo(150),
    message: "Move money formatting to lib/money and rename http helpers",
    transcript: [
      {
        role: "user",
        author: MAYA.name,
        text: "We need partial refunds on invoices. Start by moving formatMoney somewhere shared, and give the http helpers a clearer name.",
      },
      {
        role: "agent",
        text: "Moved `formatMoney` to `src/lib/money.ts`, with an optional locale, and added `parseMoney` beside it. Renamed `lib/http.ts` to `lib/http-errors.ts` and added `conflict` for 409 responses; updated the two importers.",
        tools: [
          { name: "Read", target: "src/services/invoices.ts" },
          { name: "Edit", target: "src/lib/money.ts" },
          {
            name: "Bash",
            target: "git mv src/lib/http.ts src/lib/http-errors.ts",
          },
        ],
      },
    ],
  },
  {
    sha: sha("c2"),
    at: minutesAgo(120),
    message: "Add refunds endpoint and table",
    transcript: [
      {
        role: "user",
        author: MAYA.name,
        text: "Now the endpoint. Refunds above the invoice total must be refused.",
      },
      {
        role: "agent",
        text: "Added `POST /v1/invoices/:id/refunds`, modelled on the credits endpoint, with a 409 when the amount exceeds the invoice total, and a `refunds` table migration. Added zod for request validation.",
        tools: [
          { name: "Read", target: "src/routes/credits.ts" },
          { name: "Write", target: "src/routes/refunds.ts" },
          { name: "Write", target: "migrations/0002_refunds.sql" },
          { name: "Bash", target: "pnpm add zod" },
        ],
      },
    ],
  },
  {
    sha: sha("c3"),
    at: minutesAgo(100),
    message: "Test refunds, drop the legacy CSV export, update the diagram",
    transcript: [
      {
        role: "user",
        author: MAYA.name,
        text: "Add tests, and the legacy CSV export can go.",
      },
      {
        role: "agent",
        text: "Added two tests for the refund endpoint, deleted `src/legacy/export-csv.ts` (nothing imports it), and updated the architecture diagram.",
        tools: [
          { name: "Write", target: "test/refunds.test.ts" },
          { name: "Grep", target: "exportCsv" },
          { name: "Bash", target: "pnpm test" },
        ],
      },
    ],
  },
];

// --- helpers ---

const BASE_COMMIT = sha("base");

// A file's changes, each with the text of its lines (for matching import
// lines); a binary file has none.
function changes(before: string | Buffer, after: string | Buffer) {
  if (typeof before !== "string" || typeof after !== "string") return [];
  const lines: DiffLine[] = diffLines(before, after);
  return changesOf(lines).map((c: Change) => ({
    key: c.key,
    at: c.at,
    texts: c.lines
      .map((i) => lines[i]!)
      .filter((l) => l.kind !== "same")
      .map((l) => l.text.trim()),
  }));
}

function rule(
  name: string,
  match: object,
  action: string,
  reviewers: string[] = [],
) {
  return {
    id: newEntityId("REPOSITORY_RULE"),
    run: newEntityId("PULL_REQUEST_RULE"),
    name,
    match,
    action,
    reviewers: reviewers.length
      ? `json_array(${reviewers.map(user).join(", ")})`
      : "'[]'",
  };
}

function range(path: string, text: string, first: string, last?: string) {
  return { path, ...linesOf(text, first, last) };
}

// A stand-in commit id, stable for its seed.
function sha(seed: string) {
  return createHash("sha1").update(seed).digest("hex");
}

function lineCount(text: string | Buffer) {
  return typeof text === "string" ? text.split("\n").length - 1 : 0;
}

function minutesAgo(minutes: number) {
  return Date.now() - minutes * 60_000;
}

function sql(value: unknown) {
  return `'${(typeof value === "string" ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;
}

function user(username: string) {
  return `(SELECT id FROM user WHERE username = ${sql(username)})`;
}

function agent(name: string) {
  return `(SELECT id FROM agents WHERE name = ${sql(name)})`;
}
