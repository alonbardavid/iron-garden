import { createHmac } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { API, json, signInApi, signInPage } from "../helpers";
import { TEST_ADMIN, TEST_USER } from "../users";
import { GITHUB_FIXTURE } from "./fixture";

const f = GITHUB_FIXTURE;
const HOOK = `${API}/api/github/webhooks/${f.connectionId}`;
const repository = { full_name: `${f.owner}/${f.repo}` };

interface RunPage {
  items: { runId: number; conclusion: string }[];
  nextCursor: string | null;
  total: null;
}

interface TokenPage {
  items: { id: string; name: string }[];
  nextCursor: string | null;
}

// First in the file: the deliveries below mark the webhook as working.
test.describe("GitHub settings before any delivery", () => {
  test("an admin sets the webhook up by hand from settings", async ({
    page,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(`/r/${f.repository}/settings/github`);
    await expect(page.getByText(`${f.owner}/${f.repo}`)).toBeVisible();
    await expect(page.getByText(`“${f.tokenName}” (acme-bot)`)).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Token connected" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Webhook connected" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Payload URL")).toHaveValue(
      new RegExp(`/api/github/webhooks/${f.connectionId}$`),
    );
    await page.getByRole("button", { name: "Show secret" }).click();
    await expect(page.getByLabel("Secret")).toHaveValue(f.webhookSecret);
  });

  test("the webhook button is offered only to a token that may manage hooks", async ({
    page,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(`/r/${f.repository}/settings/github`);
    // The fixture's token is not real, so GitHub (or the way to it) says no.
    await expect(
      page.getByText(/cannot create the webhook for you|could not be reached/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Set up webhook on GitHub" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Payload URL")).toBeVisible();
  });

  test("changing the token is refused without git hosting", async ({
    page,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(`/r/${f.repository}/settings/github`);
    await page.getByRole("button", { name: "Change token" }).click();
    const modal = page.getByRole("dialog", { name: "Change token" });
    await modal.getByLabel("GitHub token").click();
    await page.getByRole("option", { name: new RegExp(f.tokenName) }).click();
    await modal.getByRole("button", { name: "Use this token" }).click();
    // e2e has no Artifacts binding, so there is nowhere to mirror into.
    await expect(
      modal.getByText(/Git hosting is not configured/),
    ).toBeVisible();
  });
});

test.describe("GitHub", () => {
  test("only a delivery signed with the hook's secret is taken", async ({
    request,
  }) => {
    const ping = { zen: "Keep it simple.", repository };
    expect(
      (await deliver(request, "ping", ping, "wrong-secret")).status(),
    ).toBe(401);
    const unsigned = await request.post(HOOK, {
      data: ping,
      headers: { "x-github-event": "ping" },
    });
    expect(unsigned.status()).toBe(401);
    expect((await deliver(request, "ping", ping)).status()).toBe(200);
  });

  test("workflow runs reported by GitHub show under Workflows", async ({
    page,
    request,
  }) => {
    const finished = workflowRun({
      status: "completed",
      conclusion: "failure",
      updatedAt: "2026-10-01T10:05:00Z",
    });
    expect((await deliver(request, "workflow_run", finished)).status()).toBe(
      200,
    );
    // A late delivery of an earlier state never rolls the run back.
    const late = workflowRun({
      status: "in_progress",
      conclusion: null,
      updatedAt: "2026-10-01T10:01:00Z",
    });
    expect((await deliver(request, "workflow_run", late)).status()).toBe(200);

    await signInApi(request, TEST_USER);
    const runs = await json<RunPage>(
      await request.get(`${API}/api/repositories/${f.repository}/github/runs`),
    );
    expect(runs).toEqual({
      items: [expect.objectContaining({ runId: 4242, conclusion: "failure" })],
      nextCursor: null,
      total: null,
    });

    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await page.goto(`/r/${f.repository}`);
    await page.getByRole("link", { name: "Workflows" }).click();
    const list = page.getByRole("list", { name: "Workflow runs" });
    await expect(list.getByText("CI #7")).toBeVisible();
    await expect(list.getByText("Failed")).toBeVisible();
  });

  test("workflow runs come newest first, 20 a page", async ({
    page,
    request,
  }) => {
    // Runs 5000…5024 on their own branch, a minute apart.
    for (let i = 0; i < 25; i++) {
      const delivered = await deliver(
        request,
        "workflow_run",
        workflowRun({
          id: 5000 + i,
          branch: "paging",
          sha: "5".repeat(40),
          startedAt: new Date(Date.UTC(2026, 9, 2, 10, i)).toISOString(),
          status: "completed",
          conclusion: "success",
          updatedAt: "2026-10-03T00:00:00Z",
        }),
      );
      expect(delivered.status()).toBe(200);
    }

    await signInApi(request, TEST_USER);
    const runs = `${API}/api/repositories/${f.repository}/github/runs?branch=paging`;
    const first = await json<RunPage>(await request.get(runs));
    expect(first.items.map((run) => run.runId)).toEqual(
      Array.from({ length: 20 }, (_, i) => 5024 - i),
    );
    expect(first.nextCursor).not.toBeNull();
    const second = await json<RunPage>(
      await request.get(`${runs}&cursor=${first.nextCursor}`),
    );
    expect(second.items.map((run) => run.runId)).toEqual([
      5004, 5003, 5002, 5001, 5000,
    ]);
    expect(second.nextCursor).toBeNull();

    // With 4242 from the delivery before, the tab shows 20 and then the rest.
    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await page.goto(`/r/${f.repository}/workflows`);
    const list = page.getByRole("list", { name: "Workflow runs" });
    await expect(list.getByRole("listitem")).toHaveCount(20);
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(26);
    await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(
      0,
    );
  });

  test("a push syncs its branch from GitHub", async ({ request }) => {
    const push = await deliver(request, "push", {
      ref: "refs/heads/main",
      repository,
    });
    expect(push.status()).toBe(202);
    expect(await push.text()).toBe("Syncing main");

    // e2e has no git storage, so the sync is tried and its failure recorded.
    await signInApi(request, TEST_USER);
    await expect
      .poll(
        async () =>
          (
            await json<{ syncStatus: string }>(
              await request.get(
                `${API}/api/repositories/${f.repository}/github`,
              ),
            )
          ).syncStatus,
      )
      .toBe("failed");
  });

  test("only a token's owner lists the repositories it reaches", async ({
    request,
  }) => {
    await signInApi(request, TEST_ADMIN);
    const {
      items: [token],
    } = await json<TokenPage>(
      await request.get(`${API}/api/account/github-tokens`),
    );
    await signInApi(request, TEST_USER);
    const res = await request.get(
      `${API}/api/account/github-tokens/${token!.id}/repositories?q=web`,
    );
    expect(res.status()).toBe(404);
  });

  test("tokens page newest first, and their autocomplete offers five", async ({
    request,
  }) => {
    await signInApi(request, TEST_ADMIN);
    const tokens = `${API}/api/account/github-tokens`;
    const all = await json<TokenPage>(await request.get(tokens));
    expect(all.items).toHaveLength(1 + f.spareTokens);
    expect(all.items[0]!.name).toBe(f.tokenName);
    expect(all.nextCursor).toBeNull();

    const first = await json<TokenPage>(await request.get(`${tokens}?limit=4`));
    expect(first.items).toHaveLength(4);
    const rest = await json<TokenPage>(
      await request.get(`${tokens}?limit=4&cursor=${first.nextCursor}`),
    );
    expect(rest.nextCursor).toBeNull();
    expect([...first.items, ...rest.items].map((t) => t.id)).toEqual(
      all.items.map((t) => t.id),
    );

    const search = `${API}/api/search/github-tokens`;
    expect(await json<unknown[]>(await request.get(search))).toHaveLength(5);
    expect(
      await json<unknown[]>(await request.get(`${search}?q=spare`)),
    ).toHaveLength(5);
    expect(
      (
        await json<{ name: string }[]>(await request.get(`${search}?q=acme`))
      ).map((t) => t.name),
    ).toEqual([f.tokenName]);
  });

  test("only a repository admin may read the webhook secret", async ({
    request,
  }) => {
    await signInApi(request, TEST_USER);
    const res = await request.get(
      `${API}/api/repositories/${f.repository}/github/webhook-secret`,
    );
    expect(res.status()).toBe(403);
  });

  test("GitHub tokens belong to the person who added them", async ({
    page,
    request,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto("/account/github-tokens");
    const row = page.getByRole("row", { name: new RegExp(f.tokenName) });
    await expect(row).toContainText("acme-bot");
    await expect(row).toContainText("Fine-grained");

    await signInApi(request, TEST_USER);
    expect(
      await json(await request.get(`${API}/api/account/github-tokens`)),
    ).toEqual({ items: [], nextCursor: null, total: null });
    expect(
      await json(await request.get(`${API}/api/search/github-tokens`)),
    ).toEqual([]);
  });
});

function deliver(
  request: APIRequestContext,
  event: string,
  payload: unknown,
  secret = f.webhookSecret,
) {
  const body = JSON.stringify(payload);
  return request.post(HOOK, {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": crypto.randomUUID(),
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  });
}

function workflowRun({
  id = 4242,
  branch = "main",
  sha = "c".repeat(40),
  startedAt = "2026-10-01T10:00:00Z",
  ...update
}: {
  id?: number;
  branch?: string;
  sha?: string;
  startedAt?: string;
  status: string;
  conclusion: string | null;
  updatedAt: string;
}) {
  return {
    action: update.status === "completed" ? "completed" : "in_progress",
    repository,
    workflow_run: {
      id,
      name: "CI",
      run_number: id === 4242 ? 7 : id,
      run_attempt: 1,
      event: "push",
      head_branch: branch,
      head_sha: sha,
      status: update.status,
      conclusion: update.conclusion,
      html_url: `https://github.com/${f.owner}/${f.repo}/actions/runs/${id}`,
      run_started_at: startedAt,
      created_at: startedAt,
      updated_at: update.updatedAt,
    },
  };
}
