import { test, expect } from "@playwright/test";
import { openEmail, waitForEmailWithLink } from "../email";
import { API, ORIGIN_HEADER, signInApi, signInPage } from "../helpers";
import { LOCAL_SENDER } from "../../seed-utils";
import { TEST_ADMIN } from "../users";

// global-setup turns email sending on from LOCAL_SENDER, and other specs need
// it to stay on, so these tests save only that same state.

test("an admin sends a test email and saves the settings", async ({ page }) => {
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto("/admin/email");
  await expect(page.getByRole("radio", { name: "Enabled" })).toBeChecked();
  const sender = page.getByLabel("Sender email");
  await expect(sender).toHaveValue(LOCAL_SENDER);

  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(
    page.getByText(`Test email sent to ${TEST_ADMIN.email}`),
  ).toBeVisible();
  const message = await waitForEmailWithLink(TEST_ADMIN.email, /admin\/email/);
  expect(message.subject).toBe("Email is working");
  expect(message.fromAddress).toBe(LOCAL_SENDER);
  const inbox = await openEmail(page.context(), message);
  await expect(
    inbox.getByRole("link", { name: "Open email settings" }),
  ).toHaveAttribute("href", /^http:\/\/localhost:\d+\/admin\/email$/);
  await inbox.close();

  await page.getByRole("radio", { name: "Disabled" }).click();
  await expect(sender).toBeDisabled();
  await page.getByRole("radio", { name: "Enabled" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Email settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Enabled" })).toBeChecked();
  await expect(page.getByLabel("Sender email")).toHaveValue(LOCAL_SENDER);
});

test("disabled email sending greys out the sender", async ({ page }) => {
  await page.route("**/api/admin/email", (route) =>
    route.fulfill({ json: { enabled: false, sender: null } }),
  );
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto("/admin/email");
  await expect(page.getByRole("radio", { name: "Disabled" })).toBeChecked();
  await expect(page.getByLabel("Sender email")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send test email" }),
  ).toBeDisabled();
});

test("enabling email sending needs a sender", async ({ request }) => {
  await signInApi(request, TEST_ADMIN);
  const res = await request.put(`${API}/api/admin/email`, {
    data: { enabled: true, sender: null },
    headers: ORIGIN_HEADER,
  });
  expect(res.status()).toBe(400);
});

test("the info icon explains how to set up a sending domain", async ({
  page,
}) => {
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto("/admin/email");
  await page
    .getByRole("button", { name: "How to set up a sending domain" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Set up a sending domain" });
  await expect(
    dialog.getByRole("link", {
      name: "Compute › Email Service › Email Sending",
    }),
  ).toHaveAttribute("href", /email-service\/sending/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});
