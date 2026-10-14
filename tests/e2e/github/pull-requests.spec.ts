import { createHmac } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { API, json, signInApi, signInPage, unique } from "../helpers";
import { RULES_FIXTURE } from "../review/rules-fixture";
import { TEST_ADMIN, TEST_USER } from "../users";
import { GITHUB_FIXTURE } from "./fixture";

const f = GITHUB_FIXTURE;

interface Detail {
  status: string;
  github: { number: number; state: string } | null;
  merge: { method: string | null; by: string | null } | null;
}

test.describe("GitHub pull requests", () => {
  test("a GitHub pull request on the same branch links, closes, reopens and merges it", async ({
    request,
  }) => {
    const pr = f.pullRequests.linked;
    const event = (action: string, state: object) =>
      deliver(request, "pull_request", {
        action,
        repository,
        pull_request: githubPull(31, pr.branch, state),
      });

    expect((await event("opened", {})).status()).toBe(200);
    await signInApi(request, TEST_USER);
    expect(await detail(request, pr.number)).toMatchObject({
      status: "open",
      github: { number: 31, state: "open" },
    });

    await event("closed", { state: "closed" });
    expect(await detail(request, pr.number)).toMatchObject({
      status: "closed",
      github: { state: "closed" },
    });

    await event("reopened", {});
    expect((await detail(request, pr.number)).status).toBe("open");

    await event("closed", {
      state: "closed",
      merged: true,
      merged_at: "2026-10-13T10:00:00Z",
      merge_commit_sha: "c".repeat(40),
    });
    expect(await detail(request, pr.number)).toMatchObject({
      status: "merged",
      github: { state: "merged" },
      merge: { method: null, by: null },
    });
  });

  test("a pull request from a fork is not taken for ours", async ({
    request,
  }) => {
    const pull = githubPull(77, f.pullRequests.deleted.branch, {});
    pull.head.repo = { full_name: "someone/fork" };
    await deliver(request, "pull_request", {
      action: "opened",
      repository,
      pull_request: pull,
    });
    await signInApi(request, TEST_USER);
    expect((await detail(request, f.pullRequests.deleted.number)).github).toBe(
      null,
    );
  });

  test("deleting the branch on GitHub closes the linked pull request", async ({
    request,
  }) => {
    const pr = f.pullRequests.deleted;
    await deliver(request, "pull_request", {
      action: "opened",
      repository,
      pull_request: githubPull(32, pr.branch, {}),
    });
    const push = await deliver(request, "push", {
      ref: `refs/heads/${pr.branch}`,
      deleted: true,
      repository,
    });
    expect(push.status()).toBe(202);
    await signInApi(request, TEST_USER);
    await expect
      .poll(async () => (await detail(request, pr.number)).status)
      .toBe("closed");
  });

  test("an unconnected repository merges here, with GitHub's three methods", async ({
    page,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(
      `/r/${RULES_FIXTURE.repository}/pulls/${RULES_FIXTURE.number}`,
    );
    const merge = page.getByRole("region", { name: "Merge", exact: true });
    await expect(merge.getByText(/Merges into main here/)).toBeVisible();
    await merge.getByText("Squash", { exact: true }).click();
    await merge.getByRole("button", { name: "Squash and merge" }).click();
    // The fixture's pull request has no session repository to merge from.
    await expect(merge.getByText(/session .* is gone/)).toBeVisible();
    await merge.getByText("Rebase", { exact: true }).click();
    await expect(
      merge.getByRole("button", { name: "Rebase and merge" }),
    ).toBeVisible();
  });

  test("copying a workflow rule into a repository without that workflow drops it", async ({
    page,
    request,
  }) => {
    await signInApi(request, TEST_ADMIN);
    const name = unique("Security audit");
    await json(
      await request.post(`${API}/api/repositories/${f.repository}/rules`, {
        data: {
          rule: {
            name,
            match: { kind: "files", syntax: "glob", patterns: ["src/**"] },
            action: "run-workflow",
            workflow: {
              id: 9,
              name: "Audit",
              path: ".github/workflows/audit.yml",
            },
          },
        },
      }),
    );

    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(
      `/r/${RULES_FIXTURE.repository}/settings/rules?copy=${f.repository}`,
    );
    const copy = page.getByRole("dialog", {
      name: "Copy rules from another repository",
    });
    await copy.getByRole("checkbox", { name }).check();
    await copy.getByRole("button", { name: "Copy 1 rule" }).click();
    const dropped = page.getByRole("dialog", {
      name: "Some rules were not copied",
    });
    await expect(dropped.getByText(name)).toBeVisible();
    await dropped.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByText(name)).toBeHidden();
  });

  test("a workflow rule needs a GitHub connection to pick a workflow", async ({
    page,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(`/r/${RULES_FIXTURE.repository}/settings/rules/new`);
    await page.getByText("Run a workflow", { exact: true }).click();
    await expect(
      page.getByText(/Connect this repository to GitHub/),
    ).toBeVisible();
  });
});

const repository = { full_name: `${f.owner}/${f.repo}` };

function githubPull(number: number, branch: string, state: object) {
  return {
    number,
    html_url: `https://github.com/${f.owner}/${f.repo}/pull/${number}`,
    title: `Work on ${branch}`,
    state: "open",
    draft: false,
    merged: false,
    merged_at: null,
    merge_commit_sha: null,
    head: { ref: branch, sha: "b".repeat(40), repo: repository },
    base: { ref: "main" },
    ...state,
  };
}

function deliver(request: APIRequestContext, event: string, payload: unknown) {
  const body = JSON.stringify(payload);
  return request.post(`${API}/api/github/webhooks/${f.connectionId}`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": `sha256=${createHmac("sha256", f.webhookSecret).update(body).digest("hex")}`,
    },
  });
}

async function detail(
  request: APIRequestContext,
  number: number,
): Promise<Detail> {
  return json<Detail>(
    await request.get(
      `${API}/api/repositories/${f.repository}/pull-requests/${number}`,
    ),
  );
}
