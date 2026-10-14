import { test, expect } from "@playwright/test";
import { API, json, signInApi, signInPage, unique } from "../helpers";
import { ACTIVITY_FIXTURE as f, serveFiles } from "./activity-fixture";

const pullRequest = `/r/${f.repository}/pulls/${f.number}`;
const pullRequestApi = `${API}/api/repositories/${f.repository}/pull-requests/${f.number}`;

test.describe.configure({ mode: "serial" });

test("the Activity tab shows each commit with the transcript that made it", async ({
  page,
}) => {
  await serveFiles(page);
  await signInPage(page, f.owner.username, f.owner.password);
  await page.goto(`${pullRequest}/activity`);

  await expect(page.getByText("Regenerate the lockfile")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `View commit ${f.commits.usage.slice(0, 7)}`,
    }),
  ).toHaveAttribute("href", `/r/${f.repository}/commits/${f.commits.usage}`);
  await expect(
    page.getByRole("button", { name: /^Transcript · / }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Transcript · 4 entries" }).click();
  await expect(page.getByText("Attached by the commit trailer")).toBeVisible();
  await expect(
    page.getByText("Add metered usage to invoices", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(`Agent-Transcript: ${f.transcripts.trailer}`),
  ).toBeVisible();

  await page.getByRole("button", { name: "Transcript · 2 entries" }).click();
  await expect(page.getByText(/Uploaded through the API/)).toBeVisible();
});

test("the files the activity names link to them", async ({ page }) => {
  await serveFiles(page);
  await signInPage(page, f.owner.username, f.owner.password);
  await page.goto(`${pullRequest}/activity`);

  await page.getByRole("button", { name: "Transcript · 4 entries" }).click();
  await expect(
    page.getByRole("link", { name: "packages/metering/src/aggregate.ts" }),
  ).toHaveAttribute(
    "href",
    `/r/${f.repository}?ref=${f.commits.lockfile}&path=packages/metering/src/aggregate.ts`,
  );
  await expect(page.getByRole("link", { name: "pnpm test" })).toHaveCount(0);

  await page.getByRole("button", { name: "Transcript · 2 entries" }).click();
  await expect(
    page.getByRole("link", { name: "src/billing/money.ts" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Intl.NumberFormat" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "src/billing/money.ts" })
    .first()
    .click();
  await expect(page).toHaveURL(
    `${pullRequest}/files?file=src/billing/money.ts`,
  );

  await page.goBack();
  // The agent's comment on the file.
  await page
    .getByRole("link", { name: "src/routes/invoices.ts" })
    .first()
    .click();
  await expect(page).toHaveURL(
    `${pullRequest}/files?file=src/routes/invoices.ts`,
  );
});

test("a reviewer flags lines, sends the flag with a review, and resolves it", async ({
  page,
}) => {
  await serveFiles(page);
  await signInPage(page, f.owner.username, f.owner.password);
  await page.goto(`${pullRequest}/files?file=src/routes/invoices.ts`);

  const card = page.getByRole("article", { name: "Comment by lena-claude" });
  await expect(card).toContainText("The period comes from the invoice");

  await card.getByRole("button", { name: "Reply" }).click();
  await card.getByLabel("Reply").fill("A warning is enough for now.");
  await card.getByRole("button", { name: "Reply" }).click();
  await expect(card).toContainText("A warning is enough for now.");
  // The reply form closes after the reply lands; wait for it so the lines
  // below stop moving before the drag.
  await expect(card.getByLabel("Reply")).toBeHidden();

  // Dragging down from a line's button takes in the lines it passes over,
  // and the comment box opens only once the button goes up.
  await page.getByRole("button", { name: "Comment on line 17" }).hover();
  await page.mouse.down();
  await page.getByText("const usageCents = usage.ok").hover();
  await expect(
    page.getByRole("button", { name: "Kind of comment" }),
  ).toBeHidden();
  await page.mouse.up();
  await expect(page.getByText("lines 17–18", { exact: true })).toBeVisible();
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Count the failure too, so outages show on the dashboard.");
  await page.getByRole("button", { name: "Kind of comment" }).click();
  await page.getByRole("menuitem", { name: /^Flag/ }).click();
  await page.getByRole("button", { name: "Flag", exact: true }).click();
  const flag = page.getByRole("article", { name: "Comment by Test User" });
  await expect(flag).toContainText("goes out with your review");
  await expect(
    page.getByRole("button", { name: "Review, 1 pending" }),
  ).toBeVisible();

  await page.goto(pullRequest);
  await expect(page.getByText("1 flag is open")).toBeVisible();
  await expect(page.getByText("1 open, 0 resolved.")).toBeVisible();

  await page.getByRole("button", { name: "Review, 1 pending" }).click();
  await expect(
    page.getByText("1 flag goes out with this review"),
  ).toBeVisible();
  await page.getByLabel("Note").fill("One flag on the warning.");
  await page.getByRole("button", { name: "Request changes" }).last().click();
  await expect(page.getByText("Your review went out.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review, 0 pending" }),
  ).toBeVisible();

  await page.goto(`${pullRequest}/activity`);
  await expect(page.getByText("Requested changes")).toBeVisible();
  await expect(page.getByText("One flag on the warning.")).toBeVisible();
  await expect(
    page.getByText("flagged src/routes/invoices.ts lines 17–18"),
  ).toBeVisible();

  await page.goto(`${pullRequest}/files?file=src/routes/invoices.ts`);
  await page
    .getByRole("button", { name: "Resolve and accept these lines" })
    .click();
  await expect(flag).toContainText("Resolved by Test User");
  await page.goto(pullRequest);
  await expect(page.getByText("0 open, 1 resolved.")).toBeVisible();
});

test("an agent uploads transcripts, explains lines and answers comments", async ({
  request,
}) => {
  await signInApi(request, f.owner);
  const { plaintext } = await json<{ plaintext: string }>(
    await request.post(`${API}/api/agents/${f.agent}/keys`, {
      data: { name: unique("e2e"), expiresInDays: 30 },
    }),
  );
  const agent = { "x-api-key": plaintext };
  const entries = [{ role: "agent", text: "Regenerated the lockfile." }];

  const named = await json<{ commit: string | null; source: string }>(
    await request.post(`${API}/api/sessions/${f.sessionId}/transcripts`, {
      headers: agent,
      data: { commit: f.commits.lockfile, entries },
    }),
  );
  expect(named).toMatchObject({ commit: f.commits.lockfile, source: "api" });
  const pending = await json<{ commit: string | null; source: string }>(
    await request.post(`${API}/api/sessions/${f.sessionId}/transcripts`, {
      headers: agent,
      data: { entries },
    }),
  );
  expect(pending).toMatchObject({ commit: null, source: "trailer" });

  const range = { path: "src/billing/money.ts", start: 1, end: 5 };
  const explained = await json<{ status: string; author: { kind: string } }>(
    await request.post(`${pullRequestApi}/comments`, {
      headers: agent,
      data: {
        kind: "comment",
        ...range,
        body: "Intl.NumberFormat rounds half to even; invoices expect that.",
      },
    }),
  );
  expect(explained).toMatchObject({
    status: "sent",
    author: { kind: "agent" },
  });

  // A person's draft stays theirs until it goes out.
  const draft = await json<{ id: string; status: string }>(
    await request.post(`${pullRequestApi}/comments`, {
      data: {
        kind: "comment",
        path: range.path,
        start: 2,
        end: 2,
        body: "Draft note",
      },
    }),
  );
  expect(draft.status).toBe("draft");
  const seen = await json<
    { id: string; body: string; author: { name: string } | null }[]
  >(await request.get(`${pullRequestApi}/comments`, { headers: agent }));
  expect(seen.map((c) => c.id)).not.toContain(draft.id);

  const own = seen.find((c) => c.author?.name === f.agent)!;
  const reply = await json<{ parent: string; status: string }>(
    await request.post(`${pullRequestApi}/comments`, {
      headers: agent,
      data: { parent: own.id, body: "Blocking would hold every invoice." },
    }),
  );
  expect(reply).toMatchObject({ parent: own.id, status: "sent" });

  const agentFlag = await request.post(`${pullRequestApi}/comments`, {
    headers: agent,
    data: { kind: "flag", path: range.path, start: 1, end: 1, body: "No" },
  });
  expect(agentFlag.status()).toBe(403);
  const agentReview = await request.post(`${pullRequestApi}/reviews`, {
    headers: agent,
    data: { verdict: "accept" },
  });
  expect(agentReview.status()).toBe(403);

  await json(await request.delete(`${pullRequestApi}/comments/${draft.id}`));
});
