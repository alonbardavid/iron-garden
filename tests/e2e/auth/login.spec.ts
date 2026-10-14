import { test, expect } from "@playwright/test";
import { signInPage, submitSignIn } from "../helpers";
import { TEST_USER } from "../users";

test.describe("Sign in", () => {
  test("shows the sign-in screen when signed out", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Username or email")).toBeVisible();
  });

  test("refuses a wrong password with one generic message", async ({
    page,
  }) => {
    await submitSignIn(page, TEST_USER.username, "not-the-password");
    await expect(
      page.getByText("Wrong username, email or password"),
    ).toBeVisible();
  });

  test("signs in with a username and stays signed in", async ({ page }) => {
    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await expect(
      page.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible();
  });

  test("signs in with an email and signs out", async ({ page }) => {
    await signInPage(page, TEST_USER.email, TEST_USER.password);
    await expect(
      page.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("has no sign-up and refuses sign-up calls", async ({
    page,
    request,
  }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const res = await request.post(
      "http://localhost:8301/api/auth/sign-up/email",
      {
        data: {
          email: "x@example.com",
          password: "long-enough-pass",
          name: "X",
        },
        headers: { origin: "http://localhost:5173" },
      },
    );
    expect(res.ok()).toBe(false);
  });
});
