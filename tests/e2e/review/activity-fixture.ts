import type { Page } from "@playwright/test";
import { changesOf, diffLines } from "@lib/diff";
import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_ADMIN, TEST_USER } from "../users";

const lines = (...text: string[]) => text.map((t) => `${t}\n`).join("");

const HEAD = [
  'import { Hono } from "hono";',
  'import { requireScope } from "../auth";',
];
const ROUTE = [
  "",
  "export const invoices = new Hono<Env>();",
  "",
  'invoices.get("/v1/invoices/:id", requireScope("billing:read"), async (c) => {',
  '  const invoice = await c.var.db.invoices.find(c.req.param("id"));',
  '  if (!invoice) return c.json({ error: "not_found" }, 404);',
];

const commit = (c: string) => c.repeat(40);

// A pull request whose agent attached a transcript to two of its three
// commits, one through the commit trailer and one through the API. The agent
// explained some lines itself.
export const ACTIVITY_FIXTURE = {
  repository: "activity-fixture",
  number: 1,
  agent: "lena-claude",
  owner: TEST_USER,
  // Fixed, since global setup and the spec each load this module.
  sessionId: "SES_activity-fixture",
  pullRequestId: "PR_activity-fixture",
  transcripts: {
    trailer: "TR_activity-usage",
    api: "TR_activity-currency",
  },
  commits: {
    usage: commit("1"),
    currency: commit("2"),
    lockfile: commit("3"),
  },
  files: {
    "src/routes/invoices.ts": {
      change: "modified",
      before: lines(
        ...HEAD,
        'import { formatMoney } from "../utils/format";',
        ...ROUTE,
        "  return c.json({ id: invoice.id, total: formatMoney(invoice.totalCents) });",
        "});",
      ),
      after: lines(
        ...HEAD,
        'import { aggregateUsage } from "@lumen/metering";',
        'import { formatMoney } from "../billing/money";',
        'import { log } from "../log";',
        ...ROUTE,
        "  const usage = await aggregateUsage(c.var.db, {",
        "    customerId: invoice.customerId,",
        "    from: invoice.periodStart,",
        "    to: invoice.periodEnd,",
        "  });",
        '  if (!usage.ok) log.warn("usage aggregation failed", { invoiceId: invoice.id });',
        "  const usageCents = usage.ok ? usage.value.amountCents : 0;",
        "  return c.json({",
        "    id: invoice.id,",
        "    total: formatMoney(invoice.totalCents + usageCents, invoice.currency),",
        "  });",
        "});",
      ),
    },
    "src/billing/money.ts": {
      change: "added",
      before: "",
      after: lines(
        "export function formatMoney(cents: number, currency: string): string {",
        '  return new Intl.NumberFormat("en", { style: "currency", currency }).format(',
        "    cents / 100,",
        "  );",
        "}",
      ),
    },
  } as Record<
    string,
    { change: "added" | "modified"; before: string; after: string }
  >,
};

const f = ACTIVITY_FIXTURE;

const usageTranscript = [
  {
    role: "user",
    author: TEST_USER.name,
    text: "Add metered usage to invoices: the invoice total should include the period's usage.",
  },
  {
    role: "agent",
    text: "I'll start with the invoices route and the metering package.",
    tools: [
      { name: "Read", target: "src/routes/invoices.ts" },
      { name: "Read", target: "packages/metering/src/aggregate.ts" },
    ],
  },
  {
    role: "agent",
    text: "Aggregated usage for the invoice period and added it to the total. If aggregation fails the invoice still renders and a warning is logged, since billing must not break on a metering outage.",
    tools: [{ name: "Edit", target: "src/routes/invoices.ts" }],
  },
  {
    role: "agent",
    text: "26 passed.",
    tools: [{ name: "Run", target: "pnpm test" }],
  },
];

const currencyTranscript = [
  {
    role: "user",
    author: TEST_USER.name,
    text: "formatMoney formats every total in USD. Pass the invoice currency through.",
  },
  {
    role: "agent",
    text: "formatMoney in `src/billing/money.ts` now takes the currency and formats with `Intl.NumberFormat`.",
    tools: [
      { name: "Edit", target: "src/billing/money.ts" },
      { name: "Edit", target: "src/routes/invoices.ts" },
    ],
  },
];

const sql = (value: unknown) =>
  `'${(typeof value === "string" ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;

export function buildActivityFixtureSql(): string {
  const repositoryId = newEntityId("REPOSITORY");
  const agentId = newEntityId("AGENT");
  const user = `(SELECT id FROM user WHERE username = ${sql(f.owner.username)})`;
  const lineCount = (text: string) => text.split("\n").length - 1;
  const minutesAgo = (m: number) => Date.now() - m * 60_000;
  const commits = [
    {
      sha: f.commits.usage,
      message: `Aggregate usage into invoice responses\n\nAgent-Transcript: ${f.transcripts.trailer}`,
      at: minutesAgo(180),
    },
    {
      sha: f.commits.currency,
      message: "Pass the invoice currency through formatMoney",
      at: minutesAgo(120),
    },
    {
      sha: f.commits.lockfile,
      message: "Regenerate the lockfile",
      at: minutesAgo(100),
    },
  ];
  return [
    `INSERT INTO agents (id, owner_user_id, name) VALUES ('${agentId}', ${user}, '${f.agent}');`,
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${user}, 'write');`,
    // Someone else who reads the pull request, but must never see the owner's agents in its chat.
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', (SELECT id FROM user WHERE username = ${sql(TEST_ADMIN.username)}), 'read');`,
    `INSERT INTO agent_repository_access (agent_id, repository_id, level) VALUES ('${agentId}', '${repositoryId}', 'write');`,
    `INSERT INTO agent_sessions (id, agent_id, repository_id, title, artifacts_name, base_branch, base_commit) VALUES ('${f.sessionId}', '${agentId}', '${repositoryId}', 'Metered billing', '${f.sessionId}', 'main', '${commit("a")}');`,
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, author_user_id, title, branch, target_branch, base_commit, head_commit, status, created_at) VALUES ('${f.pullRequestId}', '${repositoryId}', ${f.number}, '${f.sessionId}', '${agentId}', ${user}, 'Bill teams for metered API usage', 'usage', 'main', '${commit("a")}', '${f.commits.lockfile}', 'open', ${minutesAgo(190)});`,
    ...Object.entries(f.files).map(([path, file]) => {
      const keys = changesOf(diffLines(file.before, file.after)).map(
        (c) => [c.key, c.at] as [string, number],
      );
      return `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${f.pullRequestId}', '${path}', '${file.change}', ${lineCount(file.before)}, ${lineCount(file.after)}, ${sql(keys)});`;
    }),
    ...commits.map(
      (c, position) =>
        `INSERT INTO pull_request_commits (id, pull_request_id, position, sha, message, author_name, committed_at, transcript_ref) VALUES ('${newEntityId("PULL_REQUEST_COMMIT")}', '${f.pullRequestId}', ${position}, '${c.sha}', ${sql(c.message)}, 'Lena Claude', ${c.at}, NULL);`,
    ),
    `INSERT INTO transcripts (id, session_id, commit_sha, source, entries) VALUES ('${f.transcripts.trailer}', '${f.sessionId}', '${f.commits.usage}', 'trailer', ${sql(usageTranscript)});`,
    `INSERT INTO transcripts (id, session_id, commit_sha, source, entries) VALUES ('${f.transcripts.api}', '${f.sessionId}', '${f.commits.currency}', 'api', ${sql(currencyTranscript)});`,
    `INSERT INTO pull_request_comments (id, pull_request_id, author_user_id, agent_id, kind, path, start_line, end_line, body, revision, head_commit, status, sent_at, created_at) VALUES ('${newEntityId("PULL_REQUEST_COMMENT")}', '${f.pullRequestId}', ${user}, '${agentId}', 'comment', 'src/routes/invoices.ts', 10, 16, ${sql("The period comes from the invoice, not from the request, so re-issuing an invoice re-aggregates the same window. Tell me if a failed aggregation should block the invoice instead.")}, 1, '${f.commits.lockfile}', 'sent', ${minutesAgo(170)}, ${minutesAgo(170)});`,
  ].join("\n");
}

// The changed files, as git storage would give them.
export async function serveFiles(page: Page) {
  await page.route(
    `**/pull-requests/${ACTIVITY_FIXTURE.number}/file?**`,
    (route) => {
      const path = new URL(route.request().url()).searchParams.get("path")!;
      const file = ACTIVITY_FIXTURE.files[path]!;
      return route.fulfill({
        json: {
          path,
          before:
            file.change === "added"
              ? null
              : { kind: "text", text: file.before },
          after: { kind: "text", text: file.after },
        },
      });
    },
  );
}
