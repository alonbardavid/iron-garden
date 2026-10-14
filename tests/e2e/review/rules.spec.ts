import { test, expect, type Page } from "@playwright/test";
import { signInPage, unique } from "../helpers";
import { TEST_ADMIN, TEST_USER } from "../users";
import { RULES_FIXTURE as f } from "./rules-fixture";

const pullRequest = `/r/${f.repository}/pulls/${f.number}`;

// Each file's two versions, as git storage would give them.
async function serveFiles(page: Page) {
  await page.route(`**/pull-requests/${f.number}/file?**`, (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")!;
    const file = f.files[path]!;
    return route.fulfill({
      json: {
        path,
        before:
          file.change === "added" ? null : { kind: "text", text: file.before },
        after:
          file.change === "deleted" ? null : { kind: "text", text: file.after },
      },
    });
  });
}

test("matched rules get their own brackets, and what they do shows in the code", async ({
  page,
}) => {
  await serveFiles(page);
  await signInPage(page, TEST_USER.username, TEST_USER.password);

  await page.goto(`${pullRequest}/brackets`);
  const brackets = page.getByRole("complementary", { name: "Brackets" });
  await expect(brackets.getByText("Matched rules")).toBeVisible();
  await expect(
    brackets.getByRole("link", { name: /Import changes/ }),
  ).toContainText("auto-accepted");
  await expect(
    brackets.getByRole("link", { name: /Money math/ }),
  ).toContainText("1 left");
  await expect(
    brackets.getByRole("link", { name: /Fee review/ }),
  ).toContainText("waiting on Test Admin");

  await expect(
    page.getByText("The total is rounded before it is returned."),
  ).toBeVisible();

  // A range opens with a few lines around it, and the rest opens on demand.
  await brackets.getByRole("link", { name: /Money math/ }).click();
  const range = page.getByRole("article");
  await expect(range).toContainText("export function total");
  await expect(range.getByText("1 more line above")).toBeVisible();
  await expect(range).not.toContainText('import { a } from "./a"');
  await range.getByRole("button", { name: "Show the 1 line above" }).click();
  await expect(range).toContainText('import { a } from "./a"');

  await page.goto(`${pullRequest}/files?file=src/money.ts`);
  const article = page.getByRole("article");
  await expect(
    article.getByText(
      "3 changes · 1 auto-accepted · 1 high impact, not accepted yet",
    ),
  ).toBeVisible();
  await expect(
    article.getByRole("button", { name: "1 auto-accepted line" }),
  ).toBeVisible();

  // Accepting the file would sweep up the high-impact change: it asks first.
  await article.getByRole("checkbox", { name: "Accept", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Accept high-impact changes too?",
  });
  await expect(dialog.getByText("Money math")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Accept the regular change" })
    .click();
  await expect(
    article.getByText(
      "3 changes · 1 accepted · 1 auto-accepted · 1 high impact, not accepted yet",
    ),
  ).toBeVisible();

  // Undoing an auto-accepted change takes it back from the rule, for you.
  await article.getByRole("button", { name: "1 auto-accepted line" }).click();
  await article
    .getByRole("checkbox", { name: /^Auto-accepted by Import changes/ })
    .click();
  await expect(
    article.getByText(
      "3 changes · 1 accepted · 1 high impact, not accepted yet",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    article.getByText(
      "3 changes · 1 accepted · 1 high impact, not accepted yet",
    ),
  ).toBeVisible();
});

test("a rule waiting on a reviewer is satisfied once they accept its changes", async ({
  page,
}) => {
  await serveFiles(page);
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(pullRequest);
  await expect(page.getByText("Fee review waits on Test Admin.")).toBeVisible();

  await page.goto(`${pullRequest}/files?file=src/fees.ts`);
  await page
    .getByRole("article")
    .getByRole("checkbox", { name: "Accept", exact: true })
    .click();
  await page.goto(`${pullRequest}/brackets`);
  await expect(
    page
      .getByRole("complementary", { name: "Brackets" })
      .getByRole("link", { name: /Fee review/ }),
  ).toContainText("reviewed by Test Admin");
});

test("moved code compares with where it came from", async ({ page }) => {
  await serveFiles(page);
  await signInPage(page, TEST_USER.username, TEST_USER.password);
  await page.goto(`${pullRequest}/brackets`);
  await page
    .getByRole("complementary", { name: "Brackets" })
    .getByRole("link", { name: /Fees move to their own file/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Left side: src/old.ts" }),
  ).toBeVisible();
  await expect(
    page.getByText("Moved as is: no line changed on the way."),
  ).toBeVisible();
});

test("an admin creates, turns off, edits, copies and deletes rules", async ({
  page,
}) => {
  const name = unique("Lockfiles");
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(`/r/${f.repository}/settings/rules`);
  await expect(page.getByRole("row", { name: /Import changes/ })).toBeVisible();

  await page.getByRole("link", { name: "New rule" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Patterns").fill("pnpm-lock.yaml\n**/*.gen.ts");
  await page.getByRole("button", { name: "Create rule" }).click();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("File names: pnpm-lock.yaml, **/*.gen.ts");
  await expect(row).toContainText("Auto-accept");

  await row.getByRole("switch").dispatchEvent("click");
  await expect(row.getByRole("switch")).not.toBeChecked();

  await row.getByRole("link").click();
  await page.getByText("Mark as high impact").click();
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(row).toContainText("High impact");

  await page.goto("/r/review-fixture/settings/rules");
  await page
    .getByRole("button", { name: "Copy from another repository" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Copy rules from another repository",
  });
  await dialog.getByLabel("Repository").click();
  await page.getByRole("option", { name: f.repository }).click();
  await expect(page).toHaveURL(/copy=rules-fixture/);
  await dialog.getByRole("checkbox", { name: "Money math" }).check();
  await dialog.getByRole("button", { name: "Copy 1 rule" }).click();
  await expect(page.getByRole("row", { name: /Money math/ })).toContainText(
    "High impact",
  );

  await page.goto(`/r/${f.repository}/settings/rules`);
  await page
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("link")
    .click();
  await page.getByRole("button", { name: "Delete rule" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete rule" })
    .click();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(
    0,
  );
});

test("the repository page shows the prompt that starts an agent session", async ({
  page,
}) => {
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(`/r/${f.repository}`);
  await page.getByRole("button", { name: "Start session" }).click();
  const prompt = page.getByText(/Start a .* session on the repository/);
  await expect(prompt).toContainText(`"repository": "${f.repository}"`);
  await expect(prompt).toContainText("/api/sessions");
  await expect(prompt).toContainText("Bearer $IG_AGENT_API_KEY");
});
