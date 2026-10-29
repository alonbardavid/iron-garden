import { test, expect } from "@playwright/test";
import { API, signInPage } from "./helpers";
import { TEST_USER } from "./users";

test.describe("documentation", () => {
  test("is public, and its pages link to each other", async ({ page }) => {
    await page.goto("/docs/");
    await expect(
      page.getByRole("heading", { name: "Introduction" }),
    ).toBeVisible();

    await page
      .getByRole("main")
      .getByRole("link", { name: "Quick start" })
      .first()
      .click();
    await expect(page).toHaveURL(
      /\/docs\/getting-started\/installation\/quick-start\/$/,
    );
    await expect(
      page.getByRole("heading", { name: "Quick start", level: 1 }),
    ).toBeVisible();
  });

  test("searches its pages", async ({ page }) => {
    await page.goto("/docs/");
    await page.getByRole("button", { name: "Search" }).click();
    await page
      .getByRole("dialog", { name: "Search" })
      .getByRole("textbox")
      .fill("setup token");
    await expect(
      page.getByRole("link", { name: /Initial setup/ }).first(),
    ).toBeVisible();
  });

  test("opens from the account menu", async ({ page }) => {
    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Documentation" }).click();
    await expect(
      page.getByRole("heading", { name: "Introduction" }),
    ).toBeVisible();
  });

  // On the Worker itself: the Vite dev server cannot run the built SPA that
  // the Worker answers a missing file with.
  test("a missing page leads back to the docs", async ({ page }) => {
    await page.goto(`${API}/docs/no-such-page/`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Go to the documentation" }).click();
    await expect(
      page.getByRole("heading", { name: "Introduction" }),
    ).toBeVisible();
  });
});
