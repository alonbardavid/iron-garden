import { architecturePng } from "./images";

// The demo repository the docs screenshots show: a small billing API, and the
// branch an agent turns into the showcase pull request, which holds one of each
// kind of change a review meets.

export type Files = Record<string, string | Buffer | null>;

const lines = (...text: string[]) => text.map((t) => `${t}\n`).join("");

const CREDITS = lines(
  'import { Hono } from "hono";',
  'import { requireScope } from "../auth";',
  'import { loadCredits } from "../services/credits";',
  'import { badRequest } from "../lib/http";',
  'import { toCreditDto } from "./credit-dto";',
  "",
  "export const credits = new Hono<Env>();",
  "",
  'credits.get("/v1/customers/:id/credits", requireScope("billing:read"), async (c) => {',
  '  const items = await loadCredits(c.var.db, c.req.param("id"));',
  "  return c.json(items.map(toCreditDto));",
  "});",
  "",
  'credits.post("/v1/customers/:id/credits", requireScope("billing:write"), async (c) => {',
  "  const body = await c.req.json<{ amountCents: number; reason: string }>();",
  "  if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) {",
  '    return badRequest(c, "bad_amount");',
  "  }",
  "  const credit = await c.var.db.credits.insert({",
  '    customerId: c.req.param("id"),',
  "    ...body,",
  "  });",
  "  return c.json(toCreditDto(credit), 201);",
  "});",
);

const INVOICES_ROUTE = (money: string, http: string, withRefunds = false) =>
  lines(
    'import { Hono } from "hono";',
    'import { requireScope } from "../auth";',
    money,
    'import { loadInvoices } from "../services/invoices";',
    http,
    "",
    "export const invoices = new Hono<Env>();",
    "",
    'invoices.get("/v1/customers/:id/invoices", requireScope("billing:read"), async (c) => {',
    withRefunds
      ? '  const list = await loadInvoices(c.var.db, c.req.param("id"), { withRefunds: true });'
      : '  const list = await loadInvoices(c.var.db, c.req.param("id"));',
    '  if (!list) return notFound(c, "customer");',
    "  return c.json(",
    "    list.map((invoice) => ({",
    "      id: invoice.id,",
    "      number: invoice.number,",
    "      total: formatMoney(invoice.totalCents, invoice.currency),",
    ...(withRefunds
      ? [
          "      refunded: formatMoney(invoice.refundedCents, invoice.currency),",
        ]
      : []),
    "      dueAt: invoice.dueAt,",
    "    })),",
    "  );",
    "});",
  );

const FORMAT_MONEY = [
  "export function formatMoney(cents: number, currency: string): string {",
  "  const amount = cents / 100;",
  '  return new Intl.NumberFormat("en-US", {',
  '    style: "currency",',
  "    currency,",
  "    minimumFractionDigits: 2,",
  "  }).format(amount);",
  "}",
];

// formatMoney as it lands in lib/money: it takes the locale now.
const FORMAT_MONEY_WITH_LOCALE = [
  "export function formatMoney(",
  "  cents: number,",
  "  currency: string,",
  '  locale = "en-US",',
  "): string {",
  "  const amount = cents / 100;",
  "  return new Intl.NumberFormat(locale, {",
  '    style: "currency",',
  "    currency,",
  "    minimumFractionDigits: 2,",
  "  }).format(amount);",
  "}",
];

const ICON = (fill: string, shape: string) =>
  lines(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    `  ${shape.replace("FILL", fill)}`,
    "</svg>",
  );

const INVOICES_SERVICE_HEAD = [
  'import type { Db } from "../db";',
  "",
  "export interface Invoice {",
  "  id: string;",
  "  number: string;",
  "  customerId: string;",
  "  totalCents: number;",
  "  currency: string;",
  "  dueAt: string;",
  "}",
  "",
  "export async function loadInvoices(",
  "  db: Db,",
  "  customerId: string,",
  "): Promise<Invoice[] | null> {",
  "  const customer = await db.customers.find(customerId);",
  "  if (!customer) return null;",
  '  return db.invoices.where({ customerId }).orderBy("dueAt", "desc");',
  "}",
];

const HTTP = [
  'import type { Context } from "hono";',
  "",
  "export function notFound(c: Context, what: string) {",
  '  return c.json({ error: "not_found", what }, 404);',
  "}",
  "",
  "export function badRequest(c: Context, error: string) {",
  "  return c.json({ error }, 400);",
  "}",
];

const PACKAGE_JSON = (deps: string[]) =>
  lines(
    "{",
    '  "name": "billing-api",',
    '  "private": true,',
    '  "type": "module",',
    '  "scripts": {',
    '    "dev": "wrangler dev",',
    '    "test": "vitest run"',
    "  },",
    '  "dependencies": {',
    ...deps,
    "  },",
    '  "devDependencies": {',
    '    "vitest": "^3.2.4",',
    '    "wrangler": "^4.40.0"',
    "  }",
    "}",
  );

const LOCKFILE = (extra: string[]) =>
  lines(
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "  .:",
    "    dependencies:",
    "      hono:",
    "        specifier: ^4.9.0",
    "        version: 4.9.8",
    ...extra,
    "",
    "packages:",
    "  hono@4.9.8:",
    "    resolution: {integrity: sha512-Ao0xHFq2Rz7lU0bQe5dW2HZKq+u3uI3Xg==}",
    "    engines: {node: '>=16.9.0'}",
  );

export const BASE: Files = {
  "docs/architecture.png": architecturePng(false),
  "public/favicon.svg": ICON(
    "#3D8438",
    '<circle cx="16" cy="16" r="12" fill="FILL"/>',
  ),
  "README.md": lines(
    "# billing-api",
    "",
    "Invoices, credits and payments for Acme customers, on Cloudflare Workers.",
    "",
    "```sh",
    "pnpm install",
    "pnpm dev",
    "```",
  ),
  "package.json": PACKAGE_JSON(['    "hono": "^4.9.0"']),
  "pnpm-lock.yaml": LOCKFILE([]),
  "src/index.ts": lines(
    'import { Hono } from "hono";',
    'import { credits } from "./routes/credits";',
    'import { invoices } from "./routes/invoices";',
    "",
    "const app = new Hono<Env>();",
    'app.route("/", credits);',
    'app.route("/", invoices);',
    "",
    "export default app;",
  ),
  "src/routes/credits.ts": CREDITS,
  "src/routes/invoices.ts": INVOICES_ROUTE(
    'import { formatMoney } from "../services/invoices";',
    'import { notFound } from "../lib/http";',
  ),
  "src/services/invoices.ts": lines(
    ...INVOICES_SERVICE_HEAD,
    "",
    ...FORMAT_MONEY,
  ),
  "src/lib/http.ts": lines(...HTTP),
  "src/legacy/export-csv.ts": lines(
    'import type { Invoice } from "../services/invoices";',
    "",
    "// Superseded by the reports service; kept until finance moves over.",
    "export function exportCsv(invoices: Invoice[]): string {",
    '  const header = "id,number,total,currency,due_at";',
    "  const rows = invoices.map((i) =>",
    '    [i.id, i.number, i.totalCents, i.currency, i.dueAt].join(","),',
    "  );",
    '  return [header, ...rows].join("\\n");',
    "}",
  ),
  "migrations/0001_init.sql": lines(
    "CREATE TABLE customers (",
    "  id TEXT PRIMARY KEY,",
    "  name TEXT NOT NULL,",
    "  currency TEXT NOT NULL",
    ");",
    "",
    "CREATE TABLE invoices (",
    "  id TEXT PRIMARY KEY,",
    "  customer_id TEXT NOT NULL REFERENCES customers(id),",
    "  number TEXT NOT NULL,",
    "  total_cents INTEGER NOT NULL,",
    "  due_at TEXT NOT NULL",
    ");",
  ),
};

const REFUNDS = lines(
  'import { Hono } from "hono";',
  'import { requireScope } from "../auth";',
  'import { badRequest, conflict } from "../lib/http-errors";',
  'import { toRefundDto } from "./refund-dto";',
  "",
  "export const refunds = new Hono<Env>();",
  "",
  'refunds.post("/v1/invoices/:id/refunds", requireScope("billing:write"), async (c) => {',
  "  const body = await c.req.json<{ amountCents: number; reason: string }>();",
  "  if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) {",
  '    return badRequest(c, "bad_amount");',
  "  }",
  '  const invoice = await c.var.db.invoices.find(c.req.param("id"));',
  "  if (invoice && body.amountCents > invoice.totalCents) {",
  '    return conflict(c, "refund_exceeds_invoice");',
  "  }",
  "  const refund = await c.var.db.refunds.insert({",
  '    invoiceId: c.req.param("id"),',
  "    ...body,",
  "  });",
  "  return c.json(toRefundDto(refund), 201);",
  "});",
);

// The showcase branch, as three commits.
export const REFUNDS_COMMITS: { message: string; files: Files }[] = [
  {
    message: "Move money formatting to lib/money and rename http helpers",
    files: {
      "src/lib/money.ts": lines(
        ...FORMAT_MONEY_WITH_LOCALE,
        "",
        "export function parseMoney(text: string): number {",
        '  const cents = Math.round(Number(text.replace(/[^0-9.-]/g, "")) * 100);',
        '  if (!Number.isFinite(cents)) throw new Error("Not an amount");',
        "  return cents;",
        "}",
      ),
      "src/services/invoices.ts": lines(...INVOICES_SERVICE_HEAD),
      "src/lib/http.ts": null,
      "src/lib/http-errors.ts": lines(
        ...HTTP,
        "",
        "export function conflict(c: Context, error: string) {",
        "  return c.json({ error }, 409);",
        "}",
      ),
      "src/routes/invoices.ts": INVOICES_ROUTE(
        'import { formatMoney } from "../lib/money";',
        'import { notFound } from "../lib/http-errors";',
        true,
      ),
      "src/routes/credits.ts": CREDITS.replace(
        'from "../lib/http"',
        'from "../lib/http-errors"',
      ),
    },
  },
  {
    message: "Add refunds endpoint and table",
    files: {
      "src/routes/refunds.ts": REFUNDS,
      "src/index.ts": lines(
        'import { Hono } from "hono";',
        'import { credits } from "./routes/credits";',
        'import { invoices } from "./routes/invoices";',
        'import { refunds } from "./routes/refunds";',
        "",
        "const app = new Hono<Env>();",
        'app.route("/", credits);',
        'app.route("/", invoices);',
        'app.route("/", refunds);',
        "",
        "export default app;",
      ),
      "migrations/0002_refunds.sql": lines(
        "CREATE TABLE refunds (",
        "  id TEXT PRIMARY KEY,",
        "  invoice_id TEXT NOT NULL REFERENCES invoices(id),",
        "  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),",
        "  reason TEXT NOT NULL,",
        "  created_at INTEGER NOT NULL DEFAULT (unixepoch())",
        ");",
        "",
        "CREATE INDEX refunds_invoice ON refunds(invoice_id);",
      ),
      "package.json": PACKAGE_JSON([
        '    "hono": "^4.9.0",',
        '    "zod": "^4.1.0"',
      ]),
      "pnpm-lock.yaml": LOCKFILE([
        "      zod:",
        "        specifier: ^4.1.0",
        "        version: 4.1.12",
      ]),
    },
  },
  {
    message: "Test refunds, drop the legacy CSV export, update the diagram",
    files: {
      "test/refunds.test.ts": lines(
        'import { describe, expect, it } from "vitest";',
        'import { app } from "./app";',
        "",
        'describe("POST /v1/invoices/:id/refunds", () => {',
        '  it("refunds part of an invoice", async () => {',
        '    const res = await app.post("/v1/invoices/inv_1/refunds", {',
        '      amountCents: 500, reason: "duplicate charge",',
        "    });",
        "    expect(res.status).toBe(201);",
        "  });",
        "",
        '  it("refuses more than the invoice total", async () => {',
        '    const res = await app.post("/v1/invoices/inv_1/refunds", {',
        '      amountCents: 1_000_000, reason: "typo",',
        "    });",
        "    expect(res.status).toBe(409);",
        "  });",
        "});",
      ),
      "src/legacy/export-csv.ts": null,
      "docs/architecture.png": architecturePng(true),
      "public/favicon.svg": ICON(
        "#2F6B2A",
        '<rect x="4" y="4" width="24" height="24" rx="6" fill="FILL"/>',
      ),
    },
  },
];

export interface ChangedFile {
  path: string;
  change: "added" | "modified" | "deleted";
  before: string | Buffer;
  after: string | Buffer;
}

// Every path the branch touches, as it was on main and as the branch leaves it.
export function changedFiles(): ChangedFile[] {
  const final: Files = { ...BASE };
  for (const commit of REFUNDS_COMMITS) Object.assign(final, commit.files);
  const paths = new Set(REFUNDS_COMMITS.flatMap((c) => Object.keys(c.files)));
  return [...paths].sort().map((path) => {
    const before = BASE[path] ?? null;
    const after = final[path] ?? null;
    return {
      path,
      change:
        before === null ? "added" : after === null ? "deleted" : "modified",
      before: before ?? "",
      after: after ?? "",
    };
  });
}

// The 1-based, inclusive lines of `text` from the line holding `first` to the
// line holding `last` (or just that line).
export function linesOf(text: string, first: string, last = first) {
  const all = text.split("\n");
  const start = all.findIndex((l) => l.includes(first)) + 1;
  const end = all.findIndex((l, i) => i >= start - 1 && l.includes(last)) + 1;
  if (!start || !end) throw new Error(`No lines ${first}…${last}`);
  return { start, end };
}

// From the line holding `first` to the closing line of the block it opens:
// the next line that is just `}` or `});`.
export function blockOf(text: string, first: string) {
  const all = text.split("\n");
  const start = all.findIndex((l) => l.includes(first)) + 1;
  const end = all.findIndex((l, i) => i >= start && /^\}\)?;?$/.test(l)) + 1;
  if (!start || !end) throw new Error(`No block at ${first}`);
  return { start, end };
}

// Every line of a file.
export function wholeFile(text: string) {
  return { start: 1, end: text.split("\n").length - 1 };
}

export const fileAt = (path: string): string => {
  for (const commit of [...REFUNDS_COMMITS].reverse()) {
    const file = commit.files[path];
    if (typeof file === "string") return file;
  }
  return BASE[path] as string;
};
export const baseFile = (path: string) => BASE[path] as string;
