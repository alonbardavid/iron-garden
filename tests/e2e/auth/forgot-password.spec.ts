import { test, expect } from "@playwright/test";
import { openEmail, waitForResetPasswordEmail } from "../email";
import { signInPage } from "../helpers";
import { RESET_USER } from "../users";

const NEW_PASSWORD = "brand-new-secret-456";

test.describe("Forgot password flow", () => {
  test("can navigate from login to forgot password", async ({ page }) => {
    await page.goto("/");
    await expect(async () => {
      await page.getByRole("link", { name: "Forgot password?" }).click();
      await expect(
        page.getByRole("heading", { name: "Forgot your password?" }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
  });

  test("resets the password via the emailed link and signs in", async ({
    page,
  }) => {
    const email = RESET_USER.email;
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible({ timeout: 10000 });

    const message = await waitForResetPasswordEmail(email);
    expect(message.subject).toBe("Reset your password");

    const inbox = await openEmail(page.context(), message);
    await expect(
      inbox.getByText("Reset your password", { exact: true }),
    ).toBeVisible();
    await expect(
      inbox.getByText(
        "Hi Reset User, we received a request to reset the password for your IronGarden account. Click the button below to choose a new password.",
      ),
    ).toBeVisible();
    const resetLink = inbox.getByRole("link", { name: "Reset password" });
    await expect(resetLink).toHaveAttribute(
      "href",
      /^http:\/\/localhost:5173\/api\/auth\/reset-password\/.+/,
    );
    await inbox.close();

    await page.goto(message.url);
    await expect(
      page.getByRole("heading", { name: "Choose a new password" }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByLabel("New password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(
      page.getByRole("heading", { name: "Password updated" }),
    ).toBeVisible({ timeout: 10000 });

    await signInPage(page, RESET_USER.username, NEW_PASSWORD);
    await expect(
      page.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible({ timeout: 10000 });
  });
});
