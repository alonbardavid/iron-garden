import {
  expect,
  test,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API, ORIGIN_HEADER, json } from "../e2e/helpers";
import { fileAt, linesOf } from "./demo";
import { CLAUDE, CODEX, PULL_REQUESTS, SESSIONS, buildDemoSql } from "./seed";
import {
  BACKEND_DIR,
  MAYA,
  PERSIST,
  REPOSITORY,
  SAM,
  openApp,
  saveDemo,
  shot,
} from "./shared";

// Builds the demo instance the docs show: people, agents and keys through the
// API, then what git storage would hold (seed.ts), then what people and
// agents do on it — working sets, comments, accepted changes, chat — through
// the API again.

test.describe.configure({ mode: "serial" });

const SETUP_TOKEN = "local-dev-setup-token-7c41e9a2b85d";
const PULL_REQUEST = `/api/repositories/${REPOSITORY}/pull-requests/${PULL_REQUESTS.refunds}`;

test("first-run setup", async ({ page }) => {
  await openApp(page);
  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByLabel("Your name").fill(MAYA.name);
  await page.getByLabel("Username").fill(MAYA.username);
  await page.getByLabel("Email").fill(MAYA.email);
  await page.getByLabel("Password").fill(MAYA.password);
  await shot(page, "setup-form");
  await page.getByRole("button", { name: /create|set up/i }).click();
  await expect(page.getByLabel("Setup token")).toBeHidden();
});

test("demo data", async ({ playwright }) => {
  const maya = await signIn(playwright, MAYA);
  const sam = await addUser(playwright, maya, SAM);
  await addPersonalKey(maya, "laptop git");
  const claude = await addAgent(playwright, maya, CLAUDE);
  const codex = await addAgent(playwright, sam, CODEX);
  seed(await buildDemoSql());
  await addRetiredAgent(maya);

  await workAsAgents(claude, codex);
  await acceptSomeChanges(maya);
  await leaveDraftNotes(maya);
  await commentAsAgent(claude, maya);
  const chat = await agentListens(maya, claude);
  await askAboutLines(maya);
  await agentAnswers(claude, chat.messagesUrl);
  await chatInSession(maya, claude);

  saveDemo({ agentKey: claude.key, chat });
});

// Both of Maya's sessions report what they edit; the dunning session takes the
// migration the refunds branch holds, which only one session may change.
async function workAsAgents(claude: Client, codex: Client) {
  await json(
    await claude.post(`/api/sessions/${SESSIONS.refunds}/activity`, {
      data: {
        editing: ["src/routes/refunds.ts", "test/refunds.test.ts"],
        done: [],
      },
    }),
  );
  await json(
    await claude.post(`/api/sessions/${SESSIONS.dunning}/activity`, {
      data: {
        editing: ["src/services/dunning.ts", "migrations/0002_refunds.sql"],
        done: [],
      },
    }),
  );
  await json(
    await codex.post(`/api/sessions/${SESSIONS.lateFees}/activity`, {
      data: { editing: ["src/services/late-fees.ts"], done: [] },
    }),
  );
}

// Maya has read the tests, the wiring and the removed export.
async function acceptSomeChanges(maya: Client) {
  const review = await json<{
    files: { path: string; changes: { key: string }[] }[];
  }>(await maya.get(`${PULL_REQUEST}/review`));
  const read = [
    "test/refunds.test.ts",
    "src/index.ts",
    "src/legacy/export-csv.ts",
  ];
  const changes = review.files
    .filter((f) => read.includes(f.path))
    .map((f) => ({ path: f.path, keys: f.changes.map((c) => c.key) }));
  await json(
    await maya.put(`${PULL_REQUEST}/review`, {
      data: { accepted: true, changes },
    }),
  );
}

// A flag sent now, and a comment that stays a draft until her review goes out.
async function leaveDraftNotes(maya: Client) {
  await json(
    await maya.post(`${PULL_REQUEST}/comments`, {
      data: {
        kind: "flag",
        path: "migrations/0002_refunds.sql",
        ...linesOf(
          fileAt("migrations/0002_refunds.sql"),
          "amount_cents INTEGER",
        ),
        body: "Partial refunds across several rows can still add up to more than the invoice. Can we enforce the total in the database?",
        send: true,
      },
    }),
  );
  await json(
    await maya.post(`${PULL_REQUEST}/comments`, {
      data: {
        kind: "comment",
        path: "src/routes/refunds.ts",
        ...linesOf(
          fileAt("src/routes/refunds.ts"),
          "if (invoice && body.amountCents",
          "refund_exceeds_invoice",
        ),
        body: "This only compares with the invoice total, not with what was already refunded.",
      },
    }),
  );
}

// An agent explains a decision on the lines it wrote; Maya answers.
async function commentAsAgent(claude: Client, maya: Client) {
  const comment = await json<{ id: string }>(
    await claude.post(`${PULL_REQUEST}/comments`, {
      data: {
        kind: "comment",
        path: "src/lib/money.ts",
        ...linesOf(
          fileAt("src/lib/money.ts"),
          "export function parseMoney",
          "return cents",
        ),
        body: "`parseMoney` rounds to whole cents on purpose: amounts arrive from the support tool as formatted strings like `$12.50`.",
      },
    }),
  );
  await json(
    await maya.post(`${PULL_REQUEST}/comments`, {
      data: {
        parent: comment.id,
        body: "Makes sense. Worth a test with a negative amount too.",
      },
    }),
  );
}

// The agent listens on the pull request's chat.
async function agentListens(maya: Client, claude: Client) {
  return json<{ messagesUrl: string }>(
    await claude.post(`/api/pull-requests/${await pullRequestId(maya)}/chat`),
  );
}

// Maya asks her agent about the lines she is reading.
async function askAboutLines(maya: Client) {
  const agents = await json<{ channel: string; adHoc: boolean }[]>(
    await maya.get(`${PULL_REQUEST}/chat`),
  );
  const channel = agents.find((a) => !a.adHoc)!.channel;
  await json(
    await maya.post(`${PULL_REQUEST}/chat/${channel}`, {
      data: {
        body: "Why not reuse the credits validation here instead of repeating it?",
        context: {
          page: "files",
          path: "src/routes/refunds.ts",
          ...linesOf(
            fileAt("src/routes/refunds.ts"),
            "if (!Number.isInteger",
            "return badRequest",
          ),
        },
      },
    }),
  );
}

// The agent fetches the question and replies.
async function agentAnswers(claude: Client, messagesUrl: string) {
  await json(await claude.get(messagesUrl));
  await json(
    await claude.post(messagesUrl, {
      data: {
        body: "The two checks only look alike: credits allow any positive amount, while refunds are also capped by the invoice. I kept them separate so the cap stays next to the check it extends.",
      },
    }),
  );
}

// Maya and her agent talk on the refunds session's page.
async function chatInSession(maya: Client, claude: Client) {
  const thread = `/api/repositories/${REPOSITORY}/sessions/${SESSIONS.refunds}/chat`;
  await json(
    await maya.post(thread, {
      data: {
        body: "Before you open the next revision: are refunds already tracked against the invoice balance anywhere?",
      },
    }),
  );
  await json(
    await claude.get(`/api/sessions/${SESSIONS.refunds}/notifications`),
  );
  await json(
    await claude.post(`/api/sessions/${SESSIONS.refunds}/chat`, {
      data: {
        body: "Not yet. `invoices.total_cents` never changes; I'll add a `refunded_cents` column in the next revision and check against `total_cents - refunded_cents`.",
      },
    }),
  );
  await json(await maya.post(thread, { data: { body: "Good, go ahead." } }));
}

// An agent nobody uses any more, switched off.
async function addRetiredAgent(maya: Client) {
  await json(
    await maya.post("/api/agents", { data: { name: "nightly-triage" } }),
  );
  await json(
    await maya.patch("/api/agents/nightly-triage", { data: { active: false } }),
  );
}

// --- plumbing ---

type Client = APIRequestContext & { key: string };
type Playwright = PlaywrightWorkerArgs["playwright"];

async function signIn(
  playwright: Playwright,
  person: { username: string; password: string },
) {
  const request = await playwright.request.newContext({
    baseURL: API,
    extraHTTPHeaders: ORIGIN_HEADER,
  });
  await json(
    await request.post("/api/auth/sign-in/username", {
      data: { username: person.username, password: person.password },
    }),
  );
  return Object.assign(request, { key: "" });
}

// Created as an admin does it, with a temporary password the person changes.
async function addUser(
  playwright: Playwright,
  admin: Client,
  person: typeof SAM,
) {
  const temporary = "temporary-password-123";
  await json(
    await admin.post("/api/auth/admin/create-user", {
      data: {
        name: person.name,
        email: person.email,
        password: temporary,
        role: "user",
        data: { username: person.username },
      },
    }),
  );
  const first = await signIn(playwright, {
    username: person.username,
    password: temporary,
  });
  await json(
    await first.post("/api/auth/change-password", {
      data: { currentPassword: temporary, newPassword: person.password },
    }),
  );
  return signIn(playwright, person);
}

async function addPersonalKey(owner: Client, name: string) {
  await json(
    await owner.post("/api/account/keys", {
      data: { name, expiresInDays: 90 },
    }),
  );
}

async function addAgent(
  playwright: Playwright,
  owner: Client,
  name: string,
): Promise<Client> {
  await json(await owner.post("/api/agents", { data: { name } }));
  const { plaintext } = await json<{ plaintext: string }>(
    await owner.post(`/api/agents/${name}/keys`, {
      data: { name: "laptop", expiresInDays: 90 },
    }),
  );
  const agent = await playwright.request.newContext({
    baseURL: API,
    extraHTTPHeaders: { "x-api-key": plaintext },
  });
  return Object.assign(agent, { key: plaintext });
}

async function pullRequestId(viewer: Client) {
  return (await json<{ id: string }>(await viewer.get(PULL_REQUEST))).id;
}

// Into the running instance's local D1, as tests/global-setup.ts seeds e2e.
function seed(statements: string) {
  const file = join(mkdtempSync(join(tmpdir(), "docs-seed-")), "seed.sql");
  writeFileSync(file, statements);
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      PERSIST,
      "--file",
      file,
    ],
    { cwd: BACKEND_DIR, stdio: "pipe" },
  );
}
