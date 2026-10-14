import { changesOf, diffLines } from "@lib/diff";
import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_USER } from "../users";

const lines = (...text: string[]) => text.map((t) => `${t}\n`).join("");

const CREDITS = lines(
  'import { Hono } from "hono";',
  'import { loadCredits } from "../services/credits";',
  'import { fetchCustomer } from "../services/customers";',
  'import { requireScope } from "../auth";',
  'import { toCreditDto } from "./credit-dto";',
  "",
  "export const credits = new Hono<Env>();",
  "",
  'credits.get("/v1/customers/:id/credits", requireScope("billing:read"), async (c) => {',
  '  const customer = await fetchCustomer(c.var.db, c.req.param("id"));',
  '  if (!customer) return c.json({ error: "not_found" }, 404);',
  "  const credits = await loadCredits(c.var.db, customer.id);",
  "  return c.json({",
  "    customer: customer.name,",
  "    currency: customer.currency,",
  "    items: credits.map(toCreditDto),",
  "    total: credits.reduce((t, cr) => t + cr.amountCents, 0),",
  "  });",
  "});",
  "",
  'credits.post("/v1/customers/:id/credits", requireScope("billing:write"), async (c) => {',
  "  const body = await c.req.json<{ amountCents: number; reason: string }>();",
  "  if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) {",
  '    return c.json({ error: "bad_amount" }, 400);',
  "  }",
  '  const credit = await c.var.db.credits.insert({ customerId: c.req.param("id"), ...body });',
  "  return c.json(toCreditDto(credit), 201);",
  "});",
);

const INVOICES_HEAD = [
  'import { Hono } from "hono";',
  'import { requireScope } from "../auth";',
  "",
  "export const invoices = new Hono<Env>();",
  "",
  'invoices.get("/v1/invoices/:id", requireScope("billing:read"), async (c) => {',
  '  const invoice = await c.var.db.invoices.find(c.req.param("id"));',
  '  if (!invoice) return c.json({ error: "not_found" }, 404);',
];
const INVOICES_TAIL = [
  "  return c.json({ id: invoice.id, customer: customer?.name ?? null });",
  "});",
  "",
  "/** Refuses while the invoice is open; the dunning job retries later. */",
  'invoices.delete("/v1/invoices/:id", requireScope("billing:write"), async (c) => {',
  '  const invoice = await c.var.db.invoices.find(c.req.param("id"));',
  '  if (!invoice) return c.json({ error: "not_found" }, 404);',
  '  if (invoice.status === "open") return c.json({ error: "open" }, 409);',
  "  await c.var.db.invoices.void(invoice.id);",
  "  return c.body(null, 204);",
  "});",
];

// A pull request whose agent copied the credits route twice and named it as
// the reference both times, seeded with what the worker would have stored.
// The reference file is served by the spec, as the target branch has it.
export const REFERENCES_FIXTURE = {
  repository: "references-fixture",
  number: 1,
  agent: "maya-claude",
  reference: { path: "src/routes/credits.ts", text: CREDITS },
  files: {
    "src/routes/invoices.ts": {
      change: "modified",
      before: lines(
        ...INVOICES_HEAD,
        "  const customer = await getCustomer(c.var.db, invoice.customerId);",
        ...INVOICES_TAIL,
      ),
      after: lines(
        ...INVOICES_HEAD,
        "  const customer = await fetchCustomer(c.var.db, invoice.customerId);",
        ...INVOICES_TAIL,
        "",
        'invoices.post("/v1/invoices/:id/credits", requireScope("billing:write"), async (c) => {',
        "  const body = await c.req.json<{ amountCents: number; reason: string }>();",
        "  if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) {",
        '    return c.json({ error: "bad_amount" }, 400);',
        "  }",
        '  const credit = await c.var.db.credits.insert({ invoiceId: c.req.param("id"), ...body });',
        "  return c.json({ id: credit.id, amountCents: credit.amountCents }, 201);",
        "});",
      ),
    },
    "src/routes/usage.ts": {
      change: "added",
      before: "",
      after: lines(
        'import { Hono } from "hono";',
        'import { aggregateUsage } from "@lumen/metering";',
        'import { fetchCustomer } from "../services/customers";',
        'import { requireScope } from "../auth";',
        'import { toUsageDto } from "./invoice-dto";',
        "",
        "export const usage = new Hono<Env>();",
        "",
        'usage.get("/v1/customers/:id/usage", requireScope("billing:read"), async (c) => {',
        '  const customer = await fetchCustomer(c.var.db, c.req.param("id"));',
        '  const period = parsePeriod(c.req.query("from"), c.req.query("to"));',
        "  const usage = await aggregateUsage(c.var.db, { customerId: customer.id, ...period });",
        '  if (!usage.ok) return c.json({ error: "usage_unavailable" }, 503);',
        "  return c.json({",
        "    customer: customer.name,",
        "    currency: customer.currency,",
        "    items: usage.value.byDay.map(toUsageDto),",
        "    total: usage.value.amountCents,",
        "  });",
        "});",
        "",
        'usage.post("/v1/customers/:id/usage", requireScope("billing:write"), async (c) => {',
        "  const body = await c.req.json<{ units: number; sku: string }>();",
        "  if (!Number.isInteger(body.units) || body.units <= 0) {",
        '    return c.json({ error: "bad_amount" }, 400);',
        "  }",
        '  const event = await c.var.db.usageEvents.insert({ customerId: c.req.param("id"), ...body });',
        "  return c.json(toUsageDto(event), 201);",
        "});",
      ),
    },
  } as Record<
    string,
    { change: "added" | "modified"; before: string; after: string }
  >,
};

const sql = (value: unknown) =>
  `'${(typeof value === "string" ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;

export function buildReferencesFixtureSql(): string {
  const f = REFERENCES_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const pullRequestId = newEntityId("PULL_REQUEST");
  const agentId = newEntityId("AGENT");
  const lineCount = (text: string) => text.split("\n").length - 1;
  const credits = f.reference.path;
  const user = `(SELECT id FROM user WHERE username = ${sql(TEST_USER.username)})`;
  const groups = [
    {
      title: "Invoices call customers with `fetchCustomer`",
      kind: "rename",
      description: "Follows the rename in the customers service.",
      ranges: [{ path: "src/routes/invoices.ts", start: 9, end: 9 }],
    },
    {
      title: "Copied from the credits route",
      kind: "copy",
      description:
        "Two changes built from the credits route: a credits endpoint on invoices, and the new usage route.",
      ranges: [
        {
          path: "src/routes/invoices.ts",
          start: 21,
          end: 29,
          note: "A credits endpoint for an invoice, copied from the credits route's POST handler.",
          reference: { path: credits, start: 20, end: 28 },
        },
        {
          path: "src/routes/usage.ts",
          start: 1,
          end: 29,
          note: "The whole route, copied from the credits route. The copy left out the customer guard.",
          reference: { path: credits, start: 1, end: 28 },
        },
      ],
    },
  ];
  return [
    `INSERT INTO agents (id, owner_user_id, name) VALUES ('${agentId}', ${user}, '${f.agent}');`,
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${user}, 'read');`,
    `INSERT INTO pull_requests (id, repository_id, number, agent_id, title, branch, target_branch, base_commit, head_commit, status) VALUES ('${pullRequestId}', '${repositoryId}', ${f.number}, '${agentId}', 'Bill teams for metered API usage', 'usage', 'main', '${"a".repeat(40)}', '${"b".repeat(40)}', 'open');`,
    ...Object.entries(f.files).map(([path, file]) => {
      const keys = changesOf(diffLines(file.before, file.after)).map(
        (c) => [c.key, c.at] as [string, number],
      );
      return `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${pullRequestId}', '${path}', '${file.change}', ${lineCount(file.before)}, ${lineCount(file.after)}, ${sql(keys)});`;
    }),
    ...groups.map(
      (g, position) =>
        `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, description, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${pullRequestId}', ${position}, ${sql(g.title)}, '${g.kind}', ${sql(g.description)}, ${sql(g.ranges)});`,
    ),
  ].join("\n");
}
