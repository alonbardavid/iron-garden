import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { API, ORIGIN_HEADER, json, signInApi, signInPage } from "../helpers";
import { COLLIDE_FIXTURE as f } from "./collide-fixture";

interface Notification {
  id: string;
  kind: "collision" | "message" | "undelivered";
  body: string;
  data: Record<string, unknown> | null;
  fromSessionId: string | null;
}

interface Transcript {
  id: string;
  commit: string | null;
  entries: number;
  updatedAt: number | null;
}

// Each test builds on the last: a collision, then messages between the two
// sessions, then one of them ending.
test.describe.configure({ mode: "serial" });

let agentA: APIRequestContext;
let agentB: APIRequestContext;

test.beforeAll(async () => {
  agentA = await agentContext(f.a.agent, f.a.owner);
  agentB = await agentContext(f.b.agent, f.b.owner);
});

test.afterAll(async () => {
  await agentA.dispose();
  await agentB.dispose();
});

test("the later of two sessions to take an exclusive file is told, once", async () => {
  const first = await report(agentA, f.a.session, [
    "assets/logo.png",
    "src/header.tsx",
  ]);
  expect(first.notifications).toEqual([]);

  const second = await report(agentB, f.b.session, ["./assets/logo.png"]);
  expect(second.notifications).toHaveLength(1);
  const [notice] = second.notifications;
  expect(notice!.kind).toBe("collision");
  expect(notice!.body).toContain("`assets/logo.png` is exclusive");
  expect(notice!.body).toContain(`rule _${f.rule.name}_`);
  expect(notice!.body).toContain(f.a.title);
  expect(notice!.data).toMatchObject({
    path: "assets/logo.png",
    other: { sessionId: f.a.session, agent: f.a.agent, live: true },
  });

  // The earlier holder is not told, and reporting again tells nobody again.
  expect(await notifications(agentA, f.a.session)).toEqual([]);
  expect(
    (await report(agentB, f.b.session, ["assets/logo.png"])).notifications,
  ).toEqual([]);
  // A file no rule marks is not a collision.
  expect(
    (await report(agentB, f.b.session, ["src/header.tsx"])).notifications,
  ).toEqual([]);
});

test("a path outside the repository is refused, the rest kept", async () => {
  const answer = await report(agentB, f.b.session, [
    "../etc/passwd",
    "src/brand.ts",
  ]);
  expect(answer.refused).toEqual(["../etc/passwd"]);
});

test("sessions message each other, and a listener poll delivers", async () => {
  const listen = await json<{ pollUrl: string; socketUrl: string }>(
    await agentA.post(`${API}/api/sessions/${f.a.session}/listen`),
  );
  expect(listen.socketUrl).toMatch(/^ws:\/\/.*\/socket$/);

  const sent = await json<{ id: string; recipientLive: boolean }>(
    await agentB.post(`${API}/api/sessions/${f.b.session}/messages`, {
      data: { to: f.a.session, body: "Are you replacing logo.png?" },
    }),
  );
  expect(sent.recipientLive).toBe(true);

  // The key in the URL is its only credential.
  const anyone = await playwrightRequest.newContext();
  const polled = await json<{ notifications: Notification[] }>(
    await anyone.get(listen.pollUrl),
  );
  await anyone.dispose();
  expect(polled.notifications).toMatchObject([
    {
      kind: "message",
      body: "Are you replacing logo.png?",
      fromSessionId: f.b.session,
      data: { from: { sessionId: f.b.session, agent: f.b.agent } },
    },
  ]);

  await json(
    await agentA.post(`${API}/api/sessions/${f.a.session}/messages`, {
      data: { to: f.b.session, body: "Only resizing it.", replyTo: sent.id },
    }),
  );
  expect(await notifications(agentB, f.b.session)).toMatchObject([
    { kind: "message", body: "Only resizing it.", fromSessionId: f.a.session },
  ]);
});

test("a session can have only so many messages waiting on one other", async () => {
  for (let i = 0; i < 5; i++) {
    const sent = await agentB.post(
      `${API}/api/sessions/${f.b.session}/messages`,
      { data: { to: f.a.session, body: `Ping ${i}` } },
    );
    expect(sent.status(), await sent.text()).toBe(200);
  }
  const refused = await agentB.post(
    `${API}/api/sessions/${f.b.session}/messages`,
    { data: { to: f.a.session, body: "Ping 5" } },
  );
  expect(refused.status()).toBe(429);
  expect(await refused.text()).toContain("still unanswered");
});

test("with messaging off, messages are refused and contacts hidden", async ({
  request,
}) => {
  await signInApi(request, f.b.owner);
  const config = await json<Record<string, unknown>>(
    await request.get(`${API}/api/admin/settings/agent-config`),
  );
  const save = (sessionMessaging: boolean) =>
    request.put(`${API}/api/admin/settings/agent-config`, {
      data: {
        processing: config.processing,
        model: config.model,
        gateway: config.gateway,
        maxTranscriptWords: config.maxTranscriptWords,
        sessionMessaging,
      },
      headers: ORIGIN_HEADER,
    });
  await json(
    await agentA.patch(`${API}/api/sessions/${f.a.session}`, {
      data: {
        contact: [{ kind: "a2a", value: "https://agents.example/pixel.json" }],
      },
    }),
  );
  try {
    expect((await save(false)).status()).toBe(200);
    const refused = await agentB.post(
      `${API}/api/sessions/${f.b.session}/messages`,
      { data: { to: f.a.session, body: "Hello?" } },
    );
    expect(refused.status()).toBe(403);
    const overview = await json<{ contact: unknown }>(
      await request.get(
        `${API}/api/repositories/${f.repository}/sessions/${f.a.session}`,
      ),
    );
    expect(overview.contact).toBeNull();
  } finally {
    expect((await save(true)).status()).toBe(200);
  }
  const shown = await json<{ contact: unknown }>(
    await request.get(
      `${API}/api/repositories/${f.repository}/sessions/${f.a.session}`,
    ),
  );
  expect(shown.contact).toEqual([
    { kind: "a2a", value: "https://agents.example/pixel.json" },
  ]);
});

test("the Sessions page shows working sets, collisions and the owner's messages", async ({
  page,
}) => {
  await signInPage(page, f.a.owner.username, f.a.owner.password);
  await page.goto(`/r/${f.repository}`);
  const rows = page.getByRole("table").getByRole("row");
  const rowA = rows.filter({ hasText: f.a.title });
  await expect(rowA).toContainText("2 files");
  await expect(rowA).toContainText("1 collision");
  await expect(rows.filter({ hasText: f.b.title })).toContainText(
    "1 collision",
  );

  await rowA.getByRole("link", { name: f.a.title }).click();
  await expect(page.getByRole("heading", { name: f.a.title })).toBeVisible();
  await expect(page.getByText("assets/logo.png").first()).toBeVisible();
  await expect(page.getByText("exclusive", { exact: true })).toBeVisible();
  await expect(
    page.getByText("took it while this session held it"),
  ).toBeVisible();
  // TEST_USER owns this session's agent, so its messages show among its
  // conversations.
  await page.getByRole("link", { name: /^Conversations/ }).click();
  await expect(page.getByText("Only resizing it.")).toBeVisible();
  await expect(page.getByText("Are you replacing logo.png?")).toBeVisible();

  // The other owner does not see this session's messages.
  await page.goto(`/r/${f.repository}/sessions/${f.b.session}/conversations`);
  await expect(page.getByRole("heading", { name: f.b.title })).toBeVisible();
  await expect(page.getByText("Only you see them")).toHaveCount(0);
});

test("an ended session's unmerged branch can be dismissed", async ({
  page,
}) => {
  await signInPage(page, f.a.owner.username, f.a.owner.password);
  await page.goto(`/r/${f.repository}?show=unmerged`);
  await expect(
    page.getByRole("table").getByRole("row").filter({ hasText: f.ended.title }),
  ).toBeVisible();
  await page.getByRole("link", { name: f.ended.title }).click();
  await expect(page.getByText(f.ended.file)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss unmerged work" }).click();
  await expect(page.getByText("Unmerged branches")).toHaveCount(0);
  await expect(page.getByText(f.ended.file)).toHaveCount(0);
});

test("a listener on a socket gets notifications pushed", async () => {
  const listen = await json<{ socketUrl: string }>(
    await agentB.post(`${API}/api/sessions/${f.b.session}/listen`),
  );
  const socket = new WebSocket(listen.socketUrl);
  const frames: { type: string; notifications: Notification[] }[] = [];
  socket.addEventListener("message", (e) =>
    frames.push(JSON.parse(String(e.data))),
  );
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  // What was waiting arrives first, even when nothing was.
  await expect.poll(() => frames.length).toBe(1);
  expect(frames[0]).toMatchObject({ type: "notifications" });

  await json(
    await agentA.post(`${API}/api/sessions/${f.a.session}/messages`, {
      data: { to: f.b.session, body: "Over the socket" },
    }),
  );
  await expect.poll(() => frames.length).toBe(2);
  expect(frames[1]!.notifications).toMatchObject([
    { kind: "message", body: "Over the socket", fromSessionId: f.a.session },
  ]);
  socket.close();
});

test("an agent uploads its transcript as it goes, and the session page shows it", async ({
  page,
}) => {
  const upload = (data: Record<string, unknown>) =>
    agentA.post(`${API}/api/sessions/${f.a.session}/transcripts`, { data });
  const first = await json<Transcript>(
    await upload({
      entries: [{ role: "user", author: "Test User", text: "Shrink the logo" }],
    }),
  );
  expect(first.updatedAt).toBeNull();
  const appended = await json<Transcript>(
    await upload({
      appendTo: first.id,
      entries: [
        {
          role: "agent",
          text: "Halved its width.",
          tools: [{ name: "Edit", target: "assets/logo.png" }],
        },
      ],
    }),
  );
  expect(appended).toMatchObject({ id: first.id, entries: 2, commit: null });
  expect(appended.updatedAt).not.toBeNull();

  // Another session cannot add to it, and a commit closes it.
  const elsewhere = await agentB.post(
    `${API}/api/sessions/${f.b.session}/transcripts`,
    { data: { appendTo: first.id, entries: [{ role: "agent", text: "Hi" }] } },
  );
  expect(elsewhere.status()).toBe(404);
  await json(
    await upload({
      appendTo: first.id,
      commit: "c".repeat(40),
      entries: [{ role: "agent", text: "Committed the smaller logo." }],
    }),
  );
  const closed = await upload({
    appendTo: first.id,
    entries: [{ role: "agent", text: "One more thing" }],
  });
  expect(closed.status()).toBe(409);
  expect(await closed.text()).toContain("without appendTo");
  await json(
    await upload({ entries: [{ role: "user", text: "Now the favicon" }] }),
  );

  // Anyone who reads the repository sees them on their own tab, the newest
  // open.
  await signInPage(page, f.b.owner.username, f.b.owner.password);
  await page.goto(`/r/${f.repository}/sessions/${f.a.session}`);
  await expect(page.getByText("Halved its width.")).toHaveCount(0);
  await page.getByRole("link", { name: /^Conversations/ }).click();
  await expect(page).toHaveURL(/\/conversations$/);
  await expect(page.getByText("Now the favicon")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Not committed yet · 1 entry/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("button", { name: /^Commit ccccccc · 3 entries/ })
    .click();
  await expect(page.getByText("Halved its width.")).toBeVisible();
  await expect(page.getByText("Edit assets/logo.png")).toBeVisible();
});

test("the person an agent works for chats with its session", async ({
  page,
  request,
  browser,
}) => {
  await signInPage(page, f.b.owner.username, f.b.owner.password);
  await page.goto(`/r/${f.repository}/sessions/${f.b.session}`);
  await page.getByRole("button", { name: "Open the chat" }).click();
  const chat = page.getByRole("region", { name: "Chat" });
  await chat.getByLabel("Message").fill("Is the brand refresh done?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Is the brand refresh done?")).toBeVisible();
  await expect(page.getByText(/Waiting for the agent/)).toBeVisible();

  // The agent gets it as a notice, and its answer shows on the page.
  const notices = (await notifications(agentB, f.b.session)).filter(
    (n) => n.kind === "chat",
  );
  expect(notices).toMatchObject([
    {
      body: "Is the brand refresh done?",
      data: { from: { name: f.b.owner.name } },
    },
  ]);
  await json(
    await agentB.post(`${API}/api/sessions/${f.b.session}/chat`, {
      data: { body: "Almost: **one icon** left." },
    }),
  );
  await expect(page.getByText("one icon")).toBeVisible();
  await expect(page.getByText(/Delivered/)).toBeVisible();

  // Nobody else sees the chat or may write to it.
  await signInApi(request, f.a.owner);
  const path = `${API}/api/repositories/${f.repository}/sessions/${f.b.session}/chat`;
  expect((await request.get(path)).status()).toBe(403);
  const sent = await request.post(path, {
    data: { body: "Hello" },
    headers: ORIGIN_HEADER,
  });
  expect(sent.status()).toBe(403);
  const other = await (await browser.newContext()).newPage();
  await signInPage(other, f.a.owner.username, f.a.owner.password);
  await other.goto(`/r/${f.repository}/sessions/${f.b.session}`);
  await expect(
    other.getByRole("link", { name: /^Conversations/ }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Open the chat" }),
  ).toHaveCount(0);
  await other.context().close();
});

test("ending a session resolves its collision and returns its unread messages", async () => {
  await json(await agentA.post(`${API}/api/sessions/${f.a.session}/end`));
  const returned = (await notifications(agentB, f.b.session)).filter(
    (n) => n.kind === "undelivered",
  );
  expect(returned).toHaveLength(5);
  const sessions = await json<{ id: string; collisionCount: number }[]>(
    await agentB.get(`${API}/api/repositories/${f.repository}/sessions`),
  );
  expect(sessions.find((s) => s.id === f.b.session)?.collisionCount).toBe(0);
});

test("a mark-exclusive rule takes file patterns only", async ({ page }) => {
  await signInPage(page, f.b.owner.username, f.b.owner.password);
  await page.goto(`/r/${f.repository}/settings/rules`);
  await expect(page.getByRole("row", { name: /Images/ })).toContainText(
    "Exclusive",
  );
  await page.getByRole("link", { name: "New rule" }).click();
  await page.getByRole("radio", { name: /^Prompt/ }).check();
  await expect(
    page.getByRole("radio", { name: /^Mark exclusive/ }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /^Pattern match/ }).check();
  await expect(
    page.getByRole("radio", { name: /^Mark exclusive/ }),
  ).toBeEnabled();
});

test("Agent config has the switch for sessions talking to each other", async ({
  page,
}) => {
  await signInPage(page, f.b.owner.username, f.b.owner.password);
  await page.goto("/admin/agent");
  await expect(
    page.getByRole("switch", { name: "Sessions can talk to each other" }),
  ).toBeChecked();
});

// A request context that acts as the agent, with a key minted by its owner.
async function agentContext(
  agent: string,
  owner: { username: string; password: string },
): Promise<APIRequestContext> {
  const asOwner = await playwrightRequest.newContext();
  await signInApi(asOwner, owner);
  const { plaintext } = await json<{ plaintext: string }>(
    await asOwner.post(`${API}/api/agents/${agent}/keys`, {
      data: { name: "e2e", expiresInDays: 1 },
      headers: ORIGIN_HEADER,
    }),
  );
  await asOwner.dispose();
  return playwrightRequest.newContext({
    extraHTTPHeaders: { "x-api-key": plaintext },
  });
}

async function report(
  agent: APIRequestContext,
  session: string,
  editing: string[],
): Promise<{ notifications: Notification[]; refused: string[] }> {
  return json(
    await agent.post(`${API}/api/sessions/${session}/activity`, {
      data: { editing },
    }),
  );
}

async function notifications(
  agent: APIRequestContext,
  session: string,
): Promise<Notification[]> {
  const answer = await json<{ notifications: Notification[] }>(
    await agent.get(`${API}/api/sessions/${session}/notifications`),
  );
  return answer.notifications;
}
