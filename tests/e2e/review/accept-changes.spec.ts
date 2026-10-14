import { test, expect, type Page } from "@playwright/test";
import { API, signInApi, signInPage } from "../helpers";
import { TEST_ADMIN } from "../users";
import { REVIEW_FIXTURE as f } from "./fixture";

const pullRequest = `/r/${f.repository}/pulls/${f.number}`;
const reviewApi = `${API}/api/repositories/${f.repository}/pull-requests/${f.number}/review`;

// The file's two versions, as git storage would give them.
async function serveFile(page: Page) {
  await page.route(`**/pull-requests/${f.number}/file?**`, (route) =>
    route.fulfill({
      json: {
        path: f.path,
        before: { kind: "text", text: f.before },
        after: { kind: "text", text: f.after },
      },
    }),
  );
}

test("a reviewer accepts changes by line, block, file and bracket, and they stay accepted", async ({
  page,
}) => {
  await serveFile(page);
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);

  await page.goto(`${pullRequest}/files`);
  const article = page.getByRole("article");
  await expect(article.getByText("3 changes, none accepted")).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: /^Accept this change \(a removed and an added line\)/,
    })
    .first()
    .click();
  await expect(article.getByText("1 of 3 changes accepted")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Accept this block (2 changes)" })
    .click();
  await expect(article.getByText("All 3 changes accepted")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accepted · undo" }),
  ).toBeVisible();

  await page.reload();
  await expect(article.getByText("All 3 changes accepted")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Accepted", exact: true }),
  ).toBeVisible();

  // A link from before brackets were called groups still opens them.
  await page.goto(`${pullRequest}/groups`);
  await expect(page).toHaveURL(/\/brackets$/);
  await expect(page.getByRole("link", { name: /accepted/ })).toBeVisible();
  await page.getByRole("button", { name: "Accepted · undo" }).click();
  await expect(page.getByText("3 changes · none accepted yet")).toBeVisible();
  await page
    .getByRole("button", { name: "Accept bracket (3 changes)" })
    .click();
  await expect(page.getByText("All 3 changes accepted")).toBeVisible();

  await page.goto(pullRequest);
  await expect(page.getByText("Your review is done.")).toBeVisible();
  await expect(page.getByText("3 of 3 accepted · 1 of 1 files")).toBeVisible();

  await page.goto(`/r/${f.repository}/pulls`);
  await expect(page.getByRole("cell").getByText("100%")).toBeVisible();
});

test("agent text renders as markdown", async ({ page }) => {
  await serveFile(page);
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(pullRequest);
  await expect(
    page.getByRole("heading", { level: 1 }).locator("em"),
  ).toHaveText("hi");
  const description = page.getByRole("region", {
    name: "What this change does",
  });
  await expect(description.locator("strong")).toHaveText("hi");
  await expect(description.locator("code")).toHaveText("hello");
  await expect(description.getByRole("listitem")).toHaveCount(2);
});

test("accepting a change the pull request does not have is refused", async ({
  request,
}) => {
  await signInApi(request, TEST_ADMIN);
  const res = await request.put(reviewApi, {
    data: { accepted: true, changes: [{ path: f.path, keys: ["nope"] }] },
  });
  expect(res.status()).toBe(400);
});
