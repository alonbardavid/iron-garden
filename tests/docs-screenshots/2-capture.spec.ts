import { expect, test, type Locator, type Page } from "@playwright/test";
import { API, ORIGIN_HEADER } from "../e2e/helpers";
import { baseFile, changedFiles } from "./demo";
import { DASHBOARD, PULL_REQUESTS, SESSIONS } from "./seed";
import { MAYA, REPOSITORY, loadDemo, openApp, shot } from "./shared";

// The screenshots the docs show, from the demo the scenario built. What only
// git storage, Workers AI or GitHub could answer is served here, as the e2e
// specs do. Each describe block is a section of the docs.

const PR = `/r/${REPOSITORY}/pulls/${PULL_REQUESTS.refunds}`;
const DASHBOARD_PR = `/r/${DASHBOARD}/pulls/${PULL_REQUESTS.darkMode}`;

test.beforeEach(async ({ page }) => {
  await serveCapabilities(page, { git: true });
  await serveGitStorage(page);
  await serveGithub(page);
  await signIn(page);
});

test.describe("getting started", () => {
  test("repositories", async ({ page }) => {
    await openApp(page);
    await expect(page.getByText(REPOSITORY).first()).toBeVisible();
    await shot(page, "first-run-repositories");

    await page.getByRole("button", { name: "New repository" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("demo-app");
    await dialog
      .getByLabel("Description")
      .fill("A first repository to try agents on");
    await shot(dialog, "first-run-new-repository");
  });

  test("empty repository", async ({ page }) => {
    await openApp(page, "/r/infra/code");
    await expect(page.getByText("This repository is empty")).toBeVisible();
    await shot(page, "first-run-empty-repository", { fullPage: true });
  });

  test("personal API key", async ({ page }) => {
    await openApp(page, "/account/keys");
    await page.getByRole("button", { name: "New key" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("laptop");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(
      page.getByRole("dialog", { name: "Copy your key now" }),
    ).toBeVisible();
    await shot(page, "first-run-api-key");
  });
});

test.describe("agent workflows", () => {
  test("agents", async ({ page }) => {
    await openApp(page, "/account/agents");
    await expect(page.getByText("nightly-triage")).toBeVisible();
    await shot(page, "agents-list");
    await openApp(page, "/account/agents/claude-laptop");
    await expect(page.getByText("Repository access")).toBeVisible();
    await shot(page, "agent-page-access", { fullPage: true });
  });

  test("sessions and starting one", async ({ page }) => {
    await openApp(page, `/r/${REPOSITORY}`);
    await expect(page.getByText("Refunds endpoint")).toBeVisible();
    await shot(page, "sessions-list", { fullPage: true });
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page.getByText("Start an agent session")).toBeVisible();
    await shot(page, "start-session-dialog");
  });

  test("a session", async ({ page }) => {
    await hideChat(page);
    await openApp(page, `/r/${REPOSITORY}/sessions/${SESSIONS.refunds}`);
    await expect(page.getByText("Working set")).toBeVisible();
    await shot(page, "session-overview", { fullPage: true });
    await openApp(
      page,
      `/r/${REPOSITORY}/sessions/${SESSIONS.refunds}/conversations`,
    );
    await expect(page.getByText("Transcripts").first()).toBeVisible();
    await shot(page, "session-conversations", { fullPage: true });
  });

  test("session chat", async ({ page }) => {
    await openApp(page, `/r/${REPOSITORY}/sessions/${SESSIONS.refunds}`);
    await page.getByRole("button", { name: /open the chat/i }).click();
    await expect(page.getByText("Good, go ahead.")).toBeVisible();
    await shot(page, "session-chat-dock");
  });

  test("processing and importing", async ({ page }) => {
    await hideChat(page);
    await openApp(
      page,
      `/r/${REPOSITORY}/pulls/${PULL_REQUESTS.lateFees}/brackets`,
    );
    await expect(page.getByText(/Processing this pull request/)).toBeVisible();
    await shot(page, "pr-processing");
    await openApp(page, `/r/${REPOSITORY}/pulls`);
    await page.getByRole("button", { name: "Import" }).click();
    await shot(page, "import-pull-request");
  });

  test("activity and transcripts", async ({ page }) => {
    await hideChat(page);
    await openApp(page, `${PR}/activity`);
    await page
      .getByRole("button", { name: /transcript/i })
      .first()
      .click();
    await shot(page, "pr-activity-transcripts", { fullPage: true });
  });
});

test.describe("code review", () => {
  test.beforeEach(async ({ page }) => {
    await hideChat(page);
  });

  test("overview", async ({ page }) => {
    await openApp(page, PR);
    await shot(card(page, "Ready to merge?"), "review-progress-part-way");
    await shot(card(page, "Merge"), "review-merge-box");
    await openApp(page, `/r/${REPOSITORY}/pulls/${PULL_REQUESTS.readme}`);
    await shot(card(page, "Merged"), "review-merged");
  });

  test("brackets", async ({ page }) => {
    await openApp(page, `${PR}/brackets`);
    await expect(page.getByText("Refund endpoint").first()).toBeVisible();
    await shot(page, "brackets-tab");
    await shot(brackets(page), "confidence-matched-rules-list");
    await shot(bracketPanel(page), "brackets-flow");
    const first = rangeCard(page, "src/routes/refunds.ts");
    await shot(first, "context-reference-range");
    await shot(first.locator(":scope > *").first(), "accept-range-pill");
    await first.getByRole("button", { name: /^Left side/ }).click();
    await shot(page, "context-left-side-menu");
    await page.keyboard.press("Escape");
    await shot(
      rangeCard(page, "src/routes/invoices.ts"),
      "brackets-range-card",
    );
  });

  test("moves and renames", async ({ page }) => {
    await openBracket(page, /Money formatting moves/);
    await shot(rangeCard(page, "src/lib/money.ts"), "context-moved-with-edits");
    await openBracket(page, /HTTP helpers renamed/);
    await shot(bracketPanel(page), "review-renamed-file");
    await shot(
      rangeCard(page, "src/lib/http-errors.ts"),
      "context-moved-as-is",
    );
  });

  test("rule brackets", async ({ page }) => {
    await openBracket(page, /Money handling/);
    await shot(bracketPanel(page), "brackets-rule-bracket");
    await openBracket(page, /Database migrations/);
    await shot(bracketPanel(page), "confidence-require-review-bracket");
    await openBracket(page, /Not in a bracket/);
    await shot(bracketPanel(page), "brackets-not-in-a-bracket");
  });

  test("files", async ({ page }) => {
    await openFile(page, "src/routes/refunds.ts");
    await shot(page, "files-tab-overview");
    await shot(article(page), "review-added-file");
    await openFile(page, "src/routes/invoices.ts");
    await shot(article(page), "review-modified-range");
    await article(page).getByRole("button", { name: "Split" }).first().click();
    await shot(article(page), "review-split-layout");
    await openFile(page, "src/legacy/export-csv.ts");
    await shot(article(page), "review-deleted-file");
  });

  test("comments and flags", async ({ page }) => {
    await openFile(page, "src/lib/money.ts");
    await shot(article(page), "review-comment-thread");
    await openFile(page, "migrations/0002_refunds.sql");
    await shot(article(page), "review-flag");
  });

  test("rules in files", async ({ page }) => {
    await openFile(page, "pnpm-lock.yaml");
    await shot(article(page), "confidence-auto-accepted-lockfile");
    await openFile(page, "src/routes/credits.ts");
    await article(page)
      .getByRole("button", { name: /auto-accepted line/ })
      .first()
      .click();
    await shot(article(page), "confidence-auto-fold-open");
  });

  test("references in files", async ({ page }) => {
    await openFile(page, "src/routes/refunds.ts");
    await shot(article(page), "context-reference-left-out");
  });

  test("images", async ({ page }) => {
    await openFile(page, "docs/architecture.png");
    await shot(article(page), "files-image-diff");
    await openFile(page, "public/favicon.svg");
    await article(page).getByText("Preview", { exact: true }).click();
    await shot(article(page), "files-svg-preview");
  });

  test("accepting and reviewing", async ({ page }) => {
    await openFile(page, "src/routes/refunds.ts");
    await article(page)
      .getByRole("checkbox", { name: "Accept", exact: true })
      .first()
      .click();
    const sweep = page.getByRole("dialog");
    await expect(sweep).toBeVisible();
    await shot(sweep, "review-sweep-warning");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Review/ }).click();
    await expect(page.getByText("Your review")).toBeVisible();
    await shot(page, "review-verdict-dialog");
  });
});

test.describe("chat", () => {
  test("an agent that stopped listening", async ({ page }) => {
    await openApp(page, `${PR}/files?file=src/routes/refunds.ts`);
    await page.getByRole("button", { name: /open the chat/i }).click();
    await shot(page, "chat-offline");
  });

  test("an agent listening", async ({ page }) => {
    const { agentKey, chat } = loadDemo();
    await page.request.get(chat.messagesUrl, {
      headers: { "x-api-key": agentKey },
    });
    await openApp(page, `${PR}/brackets`);
    await shot(page, "chat-bar");
    await openApp(page, `${PR}/files?file=src/routes/refunds.ts`);
    await page.getByRole("button", { name: /open the chat/i }).click();
    await expect(page.getByText(/I kept them separate/)).toBeVisible();
    await shot(page, "chat-panel");
  });

  test("an agent working on an answer", async ({ page }) => {
    await askAndLetTheAgentStartAnswering(page);
    await openApp(page, `${PR}/files?file=src/routes/refunds.ts`);
    await page.getByRole("button", { name: /open the chat/i }).click();
    await shot(page, "chat-thinking");
  });
});

test.describe("administration", () => {
  test("agent config", async ({ page }) => {
    await serveCapabilities(page, { git: true, ai: true });
    await page.route("**/api/admin/settings/agent-config/models?**", (route) =>
      route.fulfill({ json: MODELS }),
    );
    await openApp(page, "/admin/agent");
    await shot(
      card(page, "Pull request processing"),
      "agent-config-processing",
    );
    await shot(card(page, "Model"), "agent-config-model");
    await shot(card(page, "Sessions"), "agent-config-sessions");
    await shot(page, "agent-config-prompts", { fullPage: true });
    await card(page, "Session prompt").getByRole("button").first().click();
    await shot(page.getByRole("dialog"), "prompts-editor");
  });

  test("email", async ({ page }) => {
    await serveCapabilities(page, { git: true, email: true });
    await openApp(page, "/admin/email");
    await page.getByText("Enabled", { exact: true }).click();
    await page
      .getByLabel(/sender/i)
      .first()
      .fill("billing@acme.dev");
    await shot(page, "email-sending");
    await openApp(page, "/admin/users");
    await page.getByRole("button", { name: "New user" }).click();
    await shot(page.getByRole("dialog"), "email-new-user");
  });

  test("rules", async ({ page }) => {
    await openApp(page, `/r/${REPOSITORY}/settings/rules`);
    await expect(page.getByText("Lockfiles").first()).toBeVisible();
    await shot(page, "rules-list", { fullPage: true });
    await page
      .getByRole("link", { name: /Lockfiles/ })
      .first()
      .click();
    await shot(page, "rules-editor-pattern", { fullPage: true });
    await openApp(page, `/r/${REPOSITORY}/settings/rules`);
    await page
      .getByRole("link", { name: /Money handling/ })
      .first()
      .click();
    await shot(page, "rules-editor-prompt", { fullPage: true });
    await openApp(page, `/r/${REPOSITORY}/settings/rules`);
    await page
      .getByRole("button", { name: "Copy from another repository" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Repository").click();
    await page.getByRole("option", { name: DASHBOARD }).click();
    await dialog.getByRole("checkbox", { name: "Generated icons" }).check();
    await dialog.getByRole("checkbox", { name: "Auth checks" }).check();
    await shot(dialog, "rules-copy-dialog");
  });

  test("github tokens", async ({ page }) => {
    await openApp(page, "/account/github-tokens");
    await expect(page.getByText("acme org")).toBeVisible();
    await shot(page, "github-tokens-list");
    await page.getByRole("button", { name: /add/i }).first().click();
    await shot(page.getByRole("dialog"), "github-tokens-add-dialog");
  });

  test("github settings", async ({ page }) => {
    await openApp(page, `/r/${DASHBOARD}/settings/github`);
    await expect(page.getByText(/acme\/web-dashboard/).first()).toBeVisible();
    await shot(page, "github-settings-connected", { fullPage: true });
    await openApp(page, "/r/infra/settings/github");
    await shot(page, "github-settings-connect", { fullPage: true });
  });

  test("github webhook set up by hand", async ({ page }) => {
    await page.unroute(
      `**/api/repositories/${DASHBOARD}/github/webhook/access`,
    );
    await page.route(
      `**/api/repositories/${DASHBOARD}/github/webhook/access`,
      (route) =>
        route.fulfill({
          json: {
            allowed: false,
            reason: "the token cannot read this repository's webhooks",
          },
        }),
    );
    await page.route(
      `**/api/repositories/${DASHBOARD}/github`,
      async (route) => {
        const body = await (await route.fetch()).json();
        return route.fulfill({ json: { ...body, webhook: "manual" } });
      },
    );
    await openApp(page, `/r/${DASHBOARD}/settings/github`);
    await shot(card(page, "Webhook"), "github-webhook-manual");
  });

  test("github on a pull request", async ({ page }) => {
    await hideChat(page);
    await openApp(page, DASHBOARD_PR);
    await shot(card(page, "Merge"), "github-merge-create-in-github");
    await page.unroute(
      `**/api/repositories/${DASHBOARD}/pull-requests/${PULL_REQUESTS.darkMode}/github`,
    );
    await page.route(
      `**/api/repositories/${DASHBOARD}/pull-requests/${PULL_REQUESTS.darkMode}/github`,
      (route) => route.fulfill({ json: githubPull(true) }),
    );
    await openApp(page, DASHBOARD_PR);
    await shot(page, "github-pr-overview-checks", { fullPage: true });
    await shot(card(page, "Merge"), "github-merge-box");
  });

  test("workflows", async ({ page }) => {
    await openApp(page, `/r/${DASHBOARD}/workflows`);
    await expect(page.getByText("Nightly e2e")).toBeVisible();
    await page.getByRole("button", { name: "Details" }).nth(1).click();
    await page.waitForTimeout(500);
    await shot(page, "github-workflows-tab", { fullPage: true });
  });

  test("import from GitHub", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "New repository" }).click();
    await page.getByText("Import from GitHub", { exact: true }).click();
    await shot(page.getByRole("dialog"), "github-import-repository");
  });
});

// --- page parts ---

const article = (page: Page) => page.getByRole("article").first();
const brackets = (page: Page) =>
  page.getByRole("complementary", { name: "Brackets" });
// The open bracket, beside the list.
const bracketPanel = (page: Page) =>
  brackets(page).locator("xpath=following-sibling::*[1]");

// A card on the page, found by its title.
const card = (page: Page, title: string): Locator =>
  page
    .locator("section, [class*=Paper], [class*=Card]")
    .filter({ has: page.getByText(title, { exact: true }) })
    .last();

// A bracket's range card, found by the file it shows.
const rangeCard = (page: Page, path: string): Locator =>
  page.getByRole("article").filter({ hasText: path }).first();

async function openBracket(page: Page, title: RegExp) {
  await openApp(page, `${PR}/brackets`);
  await brackets(page).getByRole("link", { name: title }).click();
  await page.waitForTimeout(500);
}

async function openFile(page: Page, path: string) {
  await openApp(page, `${PR}/files?file=${path}`);
  await expect(article(page)).toBeVisible();
  await page.waitForTimeout(500);
}

// The floating chat bars (a pull request's, a session's) cover what most
// screenshots show.
async function hideChat(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        '[data-chat], [style*="position: fixed"]:has([aria-label^="Open the"]) { display: none !important; }';
      document.head.append(style);
    });
  });
}

// --- served answers ---

async function serveCapabilities(
  page: Page,
  on: { git?: boolean; ai?: boolean; email?: boolean },
) {
  await page.unroute("**/api/capabilities");
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ json: { email: !!on.email, git: !!on.git, ai: !!on.ai } }),
  );
}

// The demo's changed files and the reference, as git storage would give them.
async function serveGitStorage(page: Page) {
  const files = new Map(changedFiles().map((f) => [f.path, f]));
  const pullRequest = `**/api/repositories/${REPOSITORY}/pull-requests/${PULL_REQUESTS.refunds}`;
  await page.route(`${pullRequest}/file?**`, (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")!;
    const file = files.get(path)!;
    return route.fulfill({
      json: {
        path,
        before: file.change === "added" ? null : version(file.before),
        after: file.change === "deleted" ? null : version(file.after),
      },
    });
  });
  await page.route(`${pullRequest}/reference?**`, (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")!;
    return route.fulfill({ json: { path, version: version(baseFile(path)) } });
  });
}

// GitHub's side of the connected dashboard: its jobs and artifacts, the
// repositories a token reaches, and no GitHub pull request yet.
async function serveGithub(page: Page) {
  await page.route(
    `**/api/repositories/${DASHBOARD}/github/runs/*/jobs`,
    (route) => route.fulfill({ json: JOBS }),
  );
  await page.route(
    `**/api/repositories/${DASHBOARD}/github/runs/*/artifacts`,
    (route) => route.fulfill({ json: ARTIFACTS }),
  );
  await page.route(
    `**/api/repositories/${DASHBOARD}/github/webhook/access`,
    (route) => route.fulfill({ json: { allowed: true, reason: null } }),
  );
  await page.route(
    `**/api/repositories/${DASHBOARD}/pull-requests/${PULL_REQUESTS.darkMode}/github`,
    (route) => route.fulfill({ json: githubPull(false) }),
  );
  await page.route("**/api/account/github-tokens/*/repositories", (route) =>
    route.fulfill({ json: GITHUB_REPOSITORIES }),
  );
}

function githubPull(opened: boolean) {
  const head = "4f2a9c1e7b3d5f60a8e2c4b6d8f0a1c3e5b7d9f1";
  return {
    connected: true,
    pull: opened
      ? {
          number: 42,
          url: "https://github.com/acme/web-dashboard/pull/42",
          state: "open",
          draft: false,
          mergeable: true,
          mergeableState: "clean",
          headSha: head,
        }
      : null,
    checks: opened
      ? [
          {
            name: "lint",
            source: "check",
            status: "completed",
            conclusion: "success",
            url: null,
          },
          {
            name: "unit tests",
            source: "check",
            status: "completed",
            conclusion: "success",
            url: null,
          },
          {
            name: "e2e",
            source: "check",
            status: "in_progress",
            conclusion: null,
            url: null,
          },
        ]
      : [],
    runs: opened
      ? [
          {
            runId: 9101,
            workflowName: "CI",
            runNumber: 415,
            runAttempt: 1,
            event: "pull_request",
            headBranch: "dark-mode",
            headSha: head,
            status: "in_progress",
            conclusion: null,
            htmlUrl: "https://github.com/acme/web-dashboard/actions/runs/9101",
            startedAt: Date.now() - 120_000,
            updatedAt: Date.now() - 60_000,
          },
        ]
      : [],
  };
}

// Maya asks another question; her agent fetches it and says it is on it.
async function askAndLetTheAgentStartAnswering(page: Page) {
  const { agentKey, chat } = loadDemo();
  await page.request.post(
    `${API}/api/repositories/${REPOSITORY}/pull-requests/${PULL_REQUESTS.refunds}/chat/${await agentChannel(page)}`,
    {
      data: {
        body: "And can a refund exceed what is left after earlier refunds?",
      },
      headers: ORIGIN_HEADER,
    },
  );
  const asAgent = { headers: { "x-api-key": agentKey } };
  await page.request.get(chat.messagesUrl, asAgent);
  await page.request.post(
    chat.messagesUrl.replace(/messages$/, "working"),
    asAgent,
  );
}

async function agentChannel(page: Page) {
  const agents = (await (
    await page.request.get(
      `${API}/api/repositories/${REPOSITORY}/pull-requests/${PULL_REQUESTS.refunds}/chat`,
    )
  ).json()) as { channel: string; adHoc: boolean }[];
  return agents.find((a) => !a.adHoc)!.channel;
}

const MODELS = [
  {
    name: "anthropic/claude-sonnet-5-5",
    description: "Claude, through AI Gateway to Anthropic",
  },
  {
    name: "anthropic/claude-haiku-5-5",
    description: "Claude, through AI Gateway to Anthropic",
  },
];

const JOBS = [
  {
    id: 1,
    name: "build",
    status: "completed",
    conclusion: "success",
    startedAt: Date.now() - 1_300_000,
    completedAt: Date.now() - 1_200_000,
    htmlUrl: null,
    steps: [],
  },
  {
    id: 2,
    name: "deploy",
    status: "completed",
    conclusion: "success",
    startedAt: Date.now() - 1_200_000,
    completedAt: Date.now() - 1_150_000,
    htmlUrl: null,
    steps: [],
  },
];

const ARTIFACTS = [
  {
    id: 11,
    name: "preview-bundle",
    sizeInBytes: 2_480_000,
    expired: false,
    createdAt: Date.now() - 1_200_000,
    expiresAt: Date.now() + 7 * 86_400_000,
  },
];

const GITHUB_REPOSITORIES = [
  {
    owner: "acme",
    repo: "infra",
    private: true,
    description: "Terraform and deploy scripts",
  },
  {
    owner: "acme",
    repo: "mobile-app",
    private: true,
    description: "The iOS and Android apps",
  },
];

// --- plumbing ---

async function signIn(page: Page) {
  const res = await page.request.post(`${API}/api/auth/sign-in/username`, {
    data: { username: MAYA.username, password: MAYA.password },
    headers: ORIGIN_HEADER,
  });
  expect(res.ok()).toBeTruthy();
}

function version(content: string | Buffer) {
  return typeof content === "string"
    ? { kind: "text", text: content }
    : {
        kind: "image",
        type: "image/png",
        bytes: content.length,
        base64: content.toString("base64"),
      };
}
