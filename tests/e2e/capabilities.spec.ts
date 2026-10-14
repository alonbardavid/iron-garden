import { test, expect } from "@playwright/test";

// Local dev always has the simulated send_email binding, so email is on here;
// git hosting is on only when the suite runs against real Artifacts, and
// server-side processing only with real Workers AI.
test("backend /api/capabilities reports what local dev binds", async ({
  request,
}) => {
  const res = await request.get("http://localhost:8301/api/capabilities");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    email: true,
    git: Boolean(process.env.ARTIFACTS_NAMESPACE),
    ai: process.env.WORKERS_AI === "true",
  });
});

test.describe("Without email", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/capabilities", (route) =>
      route.fulfill({ json: { email: false, git: false, ai: false } }),
    );
  });

  test("login screen points to an admin instead of a reset link", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot password?" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Ask an admin for a temporary one"),
    ).toBeVisible();
  });

  test("reset routes fall back to sign in", async ({ page }) => {
    for (const path of ["/forgot-password", "/reset-password"]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
    }
  });
});
