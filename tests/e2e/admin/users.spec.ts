import { test, expect } from "@playwright/test";
import {
  API,
  ORIGIN_HEADER,
  json,
  signInApi,
  signInPage,
  unique,
} from "../helpers";
import { openEmail, waitForEmailWithLink } from "../email";
import { TEST_ADMIN } from "../users";

test.describe("Admin users", () => {
  test("with email, a new user is invited and chooses their password", async ({
    page,
    browser,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "New user" }).click();
    const username = unique("invited");
    const email = `${username}@example.com`;
    await page.getByLabel("Name", { exact: true }).fill("Invited Person");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Email").fill(email);
    await expect(
      page.getByText("They get an email to choose their own password."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: username }),
    ).toContainText("Invitation pending");

    const message = await waitForEmailWithLink(email, /reset-password/);
    expect(message.subject).toBe("You're invited to IronGarden");
    const inbox = await openEmail(page.context(), message);
    await expect(
      inbox.getByText(
        "Hi Invited Person, an admin created an account for you on IronGarden. Click the button below to choose your password and sign in.",
      ),
    ).toBeVisible();
    await inbox.close();

    const userPage = await (await browser.newContext()).newPage();
    await userPage.goto(message.url);
    await expect(
      userPage.getByRole("heading", { name: "Choose your password" }),
    ).toBeVisible();
    await userPage.getByLabel("New password").fill("my-own-password-123");
    await userPage.getByRole("button", { name: "Set password" }).click();
    await expect(
      userPage.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("row").filter({ hasText: username }),
    ).toContainText("Active");
  });

  test("without email, a new user gets a temporary password and must change it", async ({
    page,
    browser,
  }) => {
    await page.route("**/api/capabilities", (route) =>
      route.fulfill({ json: { email: false, git: false } }),
    );
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "New user" }).click();
    const username = unique("new");
    await page.getByLabel("Name", { exact: true }).fill("New Person");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Email").fill(`${username}@example.com`);
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(
      page.getByRole("heading", { name: "Temporary password" }),
    ).toBeVisible();
    const temporary = await page
      .getByRole("dialog", { name: "Temporary password" })
      .getByRole("textbox")
      .inputValue();
    expect(temporary).toHaveLength(16);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("row").filter({ hasText: username }),
    ).toContainText("Temporary password");

    const userPage = await (await browser.newContext()).newPage();
    await signInPage(userPage, username, temporary);
    await expect(
      userPage.getByRole("heading", { name: "Choose a new password" }),
    ).toBeVisible();
    await userPage.getByLabel("Temporary password").fill(temporary);
    await userPage
      .getByLabel("New password", { exact: true })
      .fill("my-own-password-123");
    await userPage
      .getByLabel("Confirm new password")
      .fill("my-own-password-123");
    await userPage.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      userPage.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible();
  });

  test("the API refuses a user who must change their password", async ({
    request,
    playwright,
  }) => {
    await signInApi(request, TEST_ADMIN);
    const username = unique("temp");
    await json(
      await request.post(`${API}/api/auth/admin/create-user`, {
        data: {
          email: `${username}@example.com`,
          password: "temporary-pass-123",
          name: "Temp",
          data: { username },
        },
        headers: ORIGIN_HEADER,
      }),
    );
    const user = await playwright.request.newContext();
    await signInApi(user, { username, password: "temporary-pass-123" });
    expect(
      (await json(await user.get(`${API}/api/me`))).mustChangePassword,
    ).toBe(true);
    const res = await user.get(`${API}/api/repositories`);
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({
      data: { reason: "password_change_required" },
    });
    await user.dispose();
  });

  test("the last admin cannot be demoted", async ({ request }) => {
    await signInApi(request, TEST_ADMIN);
    const me = await json<{ id: string }>(await request.get(`${API}/api/me`));
    const res = await request.post(`${API}/api/auth/admin/set-role`, {
      data: { userId: me.id, role: "user" },
      headers: ORIGIN_HEADER,
    });
    expect(res.status()).toBe(400);
  });
});
