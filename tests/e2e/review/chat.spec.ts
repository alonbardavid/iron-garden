import { test, expect, type APIRequestContext } from "@playwright/test";
import { API, json, signInApi, signInPage, unique } from "../helpers";
import { TEST_ADMIN } from "../users";
import { ACTIVITY_FIXTURE as f, serveFiles } from "./activity-fixture";

const pullRequest = `/r/${f.repository}/pulls/${f.number}`;
const chatApi = `${API}/api/repositories/${f.repository}/pull-requests/${f.number}/chat`;

test.describe.configure({ mode: "serial" });

// Every chat a test opens, closed after it even when it fails, so a retry
// never finds an earlier attempt's agent still listening and live.
const opened: string[] = [];

test.afterEach(async ({ request }) => {
  for (const url of opened.splice(0)) {
    await request.delete(url);
  }
});

interface Endpoints {
  url: string;
  messagesUrl: string;
  socketUrl: string;
}

interface Poll {
  pullRequest: { number: number; repository: string };
  messages: {
    id: string;
    from: { name: string };
    body: string;
    context: Record<string, unknown> | null;
  }[];
}

interface ChatAgent {
  channel: string;
  agent: { name: string };
  madeThis: boolean;
  live: boolean;
}

test("an agent listens, gets a person's message once, and replies to it", async ({
  request,
}) => {
  const { name, chat } = await listen(request);
  expect(chat.messagesUrl).toMatch(
    /\/api\/chat\/cgit_chat_[\w-]{43}\/messages$/,
  );
  expect(chat.socketUrl).toMatch(/^ws:\/\/.*\/socket$/);

  const empty = await json<Poll>(await request.get(chat.messagesUrl));
  expect(empty.messages).toEqual([]);
  expect(empty.pullRequest).toMatchObject({
    number: f.number,
    repository: f.repository,
  });

  const agent = await channelOf(request, name);
  expect(agent).toMatchObject({ madeThis: false, live: true });

  const sent = await json<{ id: string; delivered: boolean }>(
    await send(request, agent.channel, {
      body: "Why is the period inclusive?",
      context: {
        page: "files",
        path: "src/routes/invoices.ts",
        start: 10,
        end: 16,
      },
    }),
  );
  expect(sent.delivered).toBe(false);

  const got = await json<Poll>(await request.get(chat.messagesUrl));
  expect(got.messages).toHaveLength(1);
  expect(got.messages[0]).toMatchObject({
    id: sent.id,
    from: { name: f.owner.name },
    body: "Why is the period inclusive?",
    context: {
      page: "files",
      path: "src/routes/invoices.ts",
      start: 10,
      end: 16,
    },
  });
  const again = await json<Poll>(await request.get(chat.messagesUrl));
  expect(again.messages).toEqual([]);

  await json(
    await request.post(chat.messagesUrl, {
      data: { replyTo: sent.id, body: "Re-issuing re-runs the same window." },
    }),
  );
  const thread = await json<{ sender: string; author: string; body: string }[]>(
    await request.get(`${chatApi}/${agent.channel}`),
  );
  expect(thread.map((m) => [m.sender, m.author, m.body])).toEqual([
    ["person", f.owner.name, "Why is the period inclusive?"],
    ["agent", name, "Re-issuing re-runs the same window."],
  ]);

  await json(await request.delete(chat.url));
  const closed = await request.get(chat.messagesUrl);
  expect(closed.status()).toBe(410);
});

test("an agent on a socket gets messages pushed and replies up it", async ({
  request,
}) => {
  const { name, chat } = await listen(request);
  const { channel } = await channelOf(request, name);
  // Queued before the socket opens: it arrives as the first frame.
  await json(await send(request, channel, { body: "Queued" }));

  const socket = new WebSocket(chat.socketUrl);
  const frames: { type: string; messages?: { body: string }[] }[] = [];
  socket.addEventListener("message", (e) =>
    frames.push(JSON.parse(String(e.data))),
  );
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  await expect.poll(() => frames.length).toBe(1);
  expect(frames[0]!.messages!.map((m) => m.body)).toEqual(["Queued"]);

  const pushed = await json<{ delivered: boolean }>(
    await send(request, channel, { body: "Pushed" }),
  );
  expect(pushed.delivered).toBe(true);
  await expect.poll(() => frames.length).toBe(2);
  expect(frames[1]!.messages!.map((m) => m.body)).toEqual(["Pushed"]);

  socket.send(JSON.stringify({ type: "reply", body: "Over the socket" }));
  await expect.poll(() => frames.length).toBe(3);
  expect(frames[2]).toMatchObject({
    type: "sent",
    message: { sender: "agent", body: "Over the socket" },
  });

  const closed = new Promise<number>((resolve) =>
    socket.addEventListener("close", (e) => resolve(e.code)),
  );
  await json(await request.delete(chat.url));
  expect(await closed).toBe(4000);
});

test("only the key opens a chat, and only agents listen", async ({
  request,
}) => {
  const unknown = await request.get(
    `${API}/api/chat/cgit_chat_${"x".repeat(43)}/messages`,
  );
  expect(unknown.status()).toBe(404);

  await signInApi(request, TEST_ADMIN);
  const person = await request.post(
    `${API}/api/pull-requests/${f.pullRequestId}/chat`,
  );
  expect(person.status()).toBe(403);
});

test("a person chats with the agent from any page and an ask goes only to the chat", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { name, chat } = await listen(request);
  // Polling is what shows the agent as live.
  await json(await request.get(chat.messagesUrl));
  await serveFiles(page);
  await signInPage(page, f.owner.username, f.owner.password);
  await page.goto(pullRequest);

  await page.getByRole("button", { name: "Open the chat" }).click();
  const panel = page.getByRole("region", { name: "Chat" });
  await panel.getByRole("button", { name: /^Who to talk to/ }).click();
  await expect(page.getByRole("menuitem", { name: /Ad hoc/ })).toBeDisabled();
  await page.getByRole("menuitem", { name: new RegExp(name) }).click();

  await expect(panel.getByText("Sends with")).toContainText("Overview");
  // Text selected on the page goes along, though clicking into the chat
  // clears the page's selection.
  await page.getByRole("heading", { name: /^Bill teams/ }).selectText();
  await expect(panel.getByText("Your selection")).toBeVisible();
  await panel
    .getByLabel("Message", { exact: true })
    .fill("Which callers changed?");
  await panel.getByLabel("Message", { exact: true }).press("Enter");
  await expect(panel.getByLabel("Message", { exact: true })).toHaveValue("");
  await expect(panel.getByText("Which callers changed?")).toBeVisible();
  await expect(panel.getByText("Your selection")).toBeHidden();
  // Neither the page alone nor the selection shows in the thread.
  await expect(panel.getByRole("link", { name: "Overview" })).toHaveCount(0);

  const got = await json<Poll>(await request.get(chat.messagesUrl));
  expect(got.messages[0]).toMatchObject({
    body: "Which callers changed?",
    context: { page: "overview" },
  });
  expect(got.messages[0]!.context?.selectedText).toContain(
    "Bill teams for metered API usage",
  );
  // The ticker turns to a check once the agent has it, and dots show while
  // it says it is working, until it answers.
  await expect(
    panel.getByRole("img", { name: `${name} received this` }),
  ).toBeVisible();
  await json(
    await request.post(`${chat.url}/working`, {
      data: { replyTo: got.messages[0]!.id },
    }),
  );
  const working = panel.getByRole("status", {
    name: `${name} is working on an answer`,
  });
  await expect(working).toBeVisible();
  await json(
    await request.post(chat.messagesUrl, {
      data: {
        body: "Only the invoice route:\n\n```lines\nsrc/routes/invoices.ts:10-14\n```",
      },
    }),
  );
  await expect(panel.getByText("Only the invoice route:")).toBeVisible();
  await expect(working).toBeHidden();
  await expect(panel.getByText("lines 10–14")).toBeVisible();
  await expect(
    panel.getByText("const usage = await aggregateUsage"),
  ).toBeVisible();

  // The conversation follows to the Files tab, where a comment's ask goes to
  // the chat with its lines.
  await page.getByRole("link", { name: /^Files/ }).click();
  await page
    .getByRole("navigation", { name: "File tree" })
    .getByText("invoices.ts")
    .click();
  await expect(panel.getByText("Which callers changed?")).toBeVisible();
  await page.getByRole("button", { name: "Comment on line 20" }).click();
  await expect(panel.getByText("Sends with")).toContainText(
    "routes/invoices.ts · line 20",
  );
  await page.getByLabel("Comment", { exact: true }).fill("Why log, not throw?");
  await page.getByRole("button", { name: "Kind of comment" }).click();
  await page.getByRole("menuitem", { name: /^Ask/ }).click();
  await expect(
    page.getByText(`sent to ${name} in the chat`).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel.getByText("Why log, not throw?")).toBeVisible();
  await expect(page.getByLabel("Comment", { exact: true })).toBeHidden();
  // Lines show at the foot of the message's bubble.
  await expect(
    panel.getByRole("link", { name: "Files · routes/invoices.ts · line 20" }),
  ).toBeVisible();

  const asked = await json<Poll>(await request.get(chat.messagesUrl));
  expect(asked.messages[0]).toMatchObject({
    body: "Why log, not throw?",
    context: {
      page: "files",
      path: "src/routes/invoices.ts",
      start: 20,
      end: 20,
    },
  });
  // The ask went to the chat only: no comment on the lines.
  const comments = await json<{ body: string }[]>(
    await request.get(
      `${API}/api/repositories/${f.repository}/pull-requests/${f.number}/comments`,
    ),
  );
  expect(comments.map((c) => c.body)).not.toContain("Why log, not throw?");
  await json(await request.delete(chat.url));
});

test("people see and talk to only their own agents", async ({ request }) => {
  const { name, chat } = await listen(request);
  const { channel } = await channelOf(request, name);

  await signInApi(request, TEST_ADMIN);
  const theirs = await json<ChatAgent[]>(await request.get(chatApi));
  expect(theirs.map((a) => a.agent.name)).not.toContain(name);
  const refused = await send(request, channel, { body: "Hello?" });
  expect(refused.status()).toBe(404);

  await signInApi(request, f.owner);
  await json(await request.delete(chat.url));
});

test("a message the agent has not had can be deleted, a delivered one cannot", async ({
  request,
}) => {
  const { name, chat } = await listen(request);
  const { channel } = await channelOf(request, name);
  const pending = await json<{ id: string }>(
    await send(request, channel, { body: "Never mind" }),
  );
  await json(
    await request.delete(`${chatApi}/${channel}/messages/${pending.id}`),
  );
  expect(
    (await json<Poll>(await request.get(chat.messagesUrl))).messages,
  ).toEqual([]);

  const delivered = await json<{ id: string }>(
    await send(request, channel, { body: "Read this" }),
  );
  await json(await request.get(chat.messagesUrl));
  const late = await request.delete(
    `${chatApi}/${channel}/messages/${delivered.id}`,
  );
  expect(late.status()).toBe(409);
  await json(await request.delete(chat.url));
});

test("each agent has its own thread, and an offline agent's message can be taken back", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const first = await listen(request);
  const second = await listen(request);
  await signInPage(page, f.owner.username, f.owner.password);
  await page.goto(pullRequest);
  await page.getByRole("button", { name: "Open the chat" }).click();
  const panel = page.getByRole("region", { name: "Chat" });

  await panel.getByRole("button", { name: /^Who to talk to/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(first.name) }).click();
  // Neither agent has polled yet: it is offline, and the message waits.
  await expect(panel.getByText(`${first.name} is offline`)).toBeVisible();
  await panel
    .getByLabel("Message", { exact: true })
    .fill("For the first agent");
  await panel.getByLabel("Message", { exact: true }).press("Enter");
  await expect(panel.getByText("For the first agent")).toBeVisible();
  await expect(
    panel.getByText(`Sent when ${first.name} reconnects`),
  ).toBeVisible();
  await expect(
    panel.getByRole("img", {
      name: `${first.name} is offline; it gets this when it reconnects`,
    }),
  ).toBeVisible();

  await panel.getByRole("button", { name: /^Who to talk to/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(second.name) }).click();
  await expect(panel.getByText("For the first agent")).toBeHidden();
  await panel
    .getByLabel("Message", { exact: true })
    .fill("For the second agent");
  await panel.getByLabel("Message", { exact: true }).press("Enter");
  await expect(panel.getByText("For the second agent")).toBeVisible();

  await panel.getByRole("button", { name: /^Who to talk to/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(first.name) }).click();
  await expect(panel.getByText("For the first agent")).toBeVisible();
  await expect(panel.getByText("For the second agent")).toBeHidden();
  await panel.getByRole("button", { name: "Delete this message" }).click();
  await expect(panel.getByText("For the first agent")).toBeHidden();

  expect(
    (await json<Poll>(await request.get(first.chat.messagesUrl))).messages,
  ).toEqual([]);
  const toSecond = await json<Poll>(await request.get(second.chat.messagesUrl));
  expect(toSecond.messages.map((m) => m.body)).toEqual([
    "For the second agent",
  ]);
  await json(await request.delete(first.chat.url));
  await json(await request.delete(second.chat.url));
});

// An agent of the pull request's owner that can read its repository, and the
// key it calls with.
async function readingAgent(request: APIRequestContext) {
  await signInApi(request, f.owner);
  const name = unique("chat");
  await json(await request.post(`${API}/api/agents`, { data: { name } }));
  await json(
    await request.put(`${API}/api/agents/${name}/access/${f.repository}`, {
      data: { level: "read" },
    }),
  );
  const { plaintext } = await json<{ plaintext: string }>(
    await request.post(`${API}/api/agents/${name}/keys`, {
      data: { name: "e2e", expiresInDays: 30 },
    }),
  );
  return { name, headers: { "x-api-key": plaintext } };
}

async function listen(request: APIRequestContext): Promise<{
  name: string;
  chat: Endpoints;
}> {
  const agent = await readingAgent(request);
  const chat = await json<Endpoints>(
    await request.post(`${API}/api/pull-requests/${f.pullRequestId}/chat`, {
      headers: agent.headers,
    }),
  );
  opened.push(chat.url);
  return { name: agent.name, chat };
}

async function channelOf(request: APIRequestContext, agent: string) {
  const agents = await json<ChatAgent[]>(await request.get(chatApi));
  const found = agents.find((a) => a.agent.name === agent);
  expect(found, `${agent} listens`).toBeDefined();
  return found!;
}

function send(
  request: APIRequestContext,
  channel: string,
  data: Record<string, unknown>,
) {
  return request.post(`${chatApi}/${channel}`, { data });
}
