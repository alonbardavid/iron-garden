import { test, expect } from "@playwright/test";
import { signInPage } from "../helpers";
import { TEST_ADMIN } from "../users";
import { IMAGES_FIXTURE as f } from "./images-fixture";

const files = `/r/${f.repository}/pulls/${f.number}/files`;

test.beforeEach(async ({ page }) => {
  // Both versions of each file, as git storage would give them.
  await page.route(`**/pull-requests/${f.number}/file?**`, (route) => {
    const path = new URL(route.request().url()).searchParams.get("path");
    const file = path === f.png.path ? f.png : f.svg;
    const side = (version: unknown) =>
      typeof version === "string" ? { kind: "text", text: version } : version;
    return route.fulfill({
      json: { path, before: side(file.before), after: side(file.after) },
    });
  });
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
});

test("a changed image shows both versions and how its size changed", async ({
  page,
}) => {
  await page.goto(`${files}?file=${f.png.path}`);
  const article = page.getByRole("article");
  await expect(
    article.getByRole("img", { name: `${f.png.path} before` }),
  ).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(
    article.getByRole("img", { name: `${f.png.path} after` }),
  ).toBeVisible();
  await expect(article.getByLabel("Size")).toHaveText("235 B → 389 B (+154 B)");
  await expect(article.getByLabel("Dimensions")).toHaveText(
    "96 × 48 → 160 × 80",
  );
});

test("a changed SVG shows as its diff, or as its two pictures", async ({
  page,
}) => {
  await page.goto(`${files}?file=${f.svg.path}`);
  const article = page.getByRole("article");
  await expect(article.getByText("<rect")).toBeVisible();

  await article.getByRole("button", { name: "Preview" }).click();
  await expect(
    article.getByRole("img", { name: `${f.svg.path} before` }),
  ).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(article.getByLabel("Dimensions")).toHaveText(
    "48 × 48 → 48 × 48",
  );

  await article.getByRole("button", { name: "Code" }).click();
  await expect(article.getByText("<rect")).toBeVisible();
});
