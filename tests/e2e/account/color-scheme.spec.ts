import { test, expect, type Page } from "@playwright/test";
import { signInPage } from "../helpers";
import { TEST_USER } from "../users";

test.describe("color scheme", () => {
  test("follows the system until a theme is chosen, which stays chosen", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await expect.poll(() => scheme(page)).toBe("dark");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(23, 27, 31)",
    );

    await chooseTheme(page, "Light mode");
    await expect.poll(() => scheme(page)).toBe("light");

    await page.reload();
    await expect.poll(() => scheme(page)).toBe("light");

    await chooseTheme(page, "System");
    await expect.poll(() => scheme(page)).toBe("dark");
  });
});

const scheme = (page: Page) =>
  page.locator("html").getAttribute("data-mantine-color-scheme");

const chooseTheme = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Appearance" }).hover();
  await page.getByRole("menuitem", { name, exact: true }).click();
};
