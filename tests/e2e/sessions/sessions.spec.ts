import { test, expect } from "@playwright/test";
import { signInPage } from "../helpers";
import { SESSIONS_FIXTURE as f } from "./fixture";

test.beforeEach(async ({ page }) => {
  await signInPage(page, f.viewer.username, f.viewer.password);
});

test("a repository with no sessions opens on the Sessions tab and says how to start one", async ({
  page,
}) => {
  await page.goto(`/r/${f.empty}`);
  const tabs = page.getByRole("navigation", { name: "Repository" });
  await expect(tabs.getByRole("link", { name: "Sessions" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("No agent sessions yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
});

test("lists every agent's sessions, live first, filtered by working and unmerged", async ({
  page,
}) => {
  await page.goto(`/r/${f.repository}`);
  const tabs = page.getByRole("navigation", { name: "Repository" });
  await expect(tabs.getByRole("link", { name: "Sessions 1" })).toBeVisible();

  const rows = page.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText(f.live.title);
  await expect(rows.nth(1)).toContainText("Live");
  await expect(rows.nth(1)).toContainText(`${f.agent}agentfor ${f.owner.name}`);
  await expect(rows.nth(2)).toContainText(f.idle.title);
  await expect(rows.nth(2)).toContainText("Idle, last seen 2 hours ago");

  await page.getByRole("link", { name: "Unmerged" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText(f.unmerged.title);
  await expect(rows.nth(1)).toContainText(
    `Open#${f.unmerged.pullRequest.number} ${f.unmerged.pullRequest.title}`,
  );

  await page.getByRole("link", { name: "All" }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(4)).toContainText(f.merged.title);
  await expect(rows.nth(4)).toContainText("Merged");
});

test("a session's page shows its goal, state and pull requests", async ({
  page,
}) => {
  await page.goto(`/r/${f.repository}?show=all`);
  await page.getByRole("link", { name: f.unmerged.title }).click();
  await expect(page).toHaveURL(`/r/${f.repository}/sessions/${f.unmerged.id}`);
  await expect(
    page.getByRole("heading", { name: f.unmerged.title }),
  ).toBeVisible();
  await expect(page.getByText("Ended 5 hours ago")).toBeVisible();
  await page
    .getByRole("link", { name: `#${f.unmerged.pullRequest.number}` })
    .click();
  await expect(page).toHaveURL(
    `/r/${f.repository}/pulls/${f.unmerged.pullRequest.number}`,
  );

  await page.goto(`/r/${f.repository}/sessions/${f.live.id}`);
  await expect(page.getByRole("heading", { name: f.live.title })).toBeVisible();
  await expect(page.getByText("new mark")).toBeVisible();
  await expect(page.getByText("claude-code")).toBeVisible();
  await page.getByRole("link", { name: "← Sessions" }).click();
  await expect(page).toHaveURL(`/r/${f.repository}`);
});
