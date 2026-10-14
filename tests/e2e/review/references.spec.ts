import { test, expect, type Page } from "@playwright/test";
import { signInPage } from "../helpers";
import { TEST_USER } from "../users";
import { REFERENCES_FIXTURE as f } from "./references-fixture";

const pullRequest = `/r/${f.repository}/pulls/${f.number}`;

// The changed files and the reference, as git storage would give them.
async function serveFiles(page: Page) {
  await page.route(`**/pull-requests/${f.number}/file?**`, (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")!;
    const file = f.files[path]!;
    return route.fulfill({
      json: {
        path,
        before:
          file.change === "added" ? null : { kind: "text", text: file.before },
        after: { kind: "text", text: file.after },
      },
    });
  });
  await page.route(`**/pull-requests/${f.number}/reference?**`, (route) =>
    route.fulfill({
      json: {
        path: f.reference.path,
        version: { kind: "text", text: f.reference.text },
      },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await serveFiles(page);
  await signInPage(page, TEST_USER.username, TEST_USER.password);
});

test("a copied file opens beside its reference, with only the differences marked", async ({
  page,
}) => {
  await page.goto(`${pullRequest}/files?file=src/routes/usage.ts`);
  const article = page.getByRole("article");
  await expect(
    article.getByRole("button", { name: `Left side: ${f.reference.path}` }),
  ).toContainText("reference");
  await expect(article.getByText(/\d+ same · .* left out/)).toBeVisible();
  await expect(article.getByText("left out", { exact: true })).toHaveCount(2);
  await expect(
    article.getByTitle("Reference line 12, left out of the copy"),
  ).toBeVisible();
  await expect(
    article.getByTitle("Reference line 1: same as the reference"),
  ).toBeVisible();
});

test("only the chunk with a reference is compared, and the button brings the comparison back", async ({
  page,
}) => {
  await page.goto(`${pullRequest}/files?file=src/routes/invoices.ts`);
  const article = page.getByRole("article");
  await expect(article.getByRole("button", { name: /^Left side/ })).toHaveCount(
    1,
  );
  await expect(
    article.getByText("6 same · 2 renamed only · 1 changed"),
  ).toBeVisible();

  await article
    .getByRole("group", { name: "Diff layout" })
    .last()
    .getByRole("button", { name: "Unified" })
    .click();
  await expect(
    article.getByText("6 same · 2 renamed only · 1 changed"),
  ).toBeHidden();
  await article.getByRole("button", { name: "Compare with reference" }).click();
  await expect(
    article.getByText("6 same · 2 renamed only · 1 changed"),
  ).toBeVisible();
});

test("the left side switches between the reference and the file before", async ({
  page,
}) => {
  await page.goto(`${pullRequest}/brackets`);
  await page
    .getByRole("complementary", { name: "Brackets" })
    .getByRole("link", { name: /Copied from the credits route/ })
    .click();
  const card = page.getByRole("article").filter({ hasText: "invoices.ts" });
  await expect(
    card.getByText("6 same · 2 renamed only · 1 changed"),
  ).toBeVisible();

  await card.getByRole("button", { name: /^Left side/ }).click();
  await expect(
    page.getByRole("menuitem", { name: /Reference implementation/ }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: /This file, before/ }).click();
  await expect(
    card.getByRole("button", { name: "Left side: This file, before" }),
  ).toContainText("Before");
  await expect(
    card.getByText("6 same · 2 renamed only · 1 changed"),
  ).toBeHidden();

  await card.getByRole("button", { name: "Compare with reference" }).click();
  await expect(
    card.getByText("6 same · 2 renamed only · 1 changed"),
  ).toBeVisible();
});
