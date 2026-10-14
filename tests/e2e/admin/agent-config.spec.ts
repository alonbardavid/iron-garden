import { test, expect, type Page } from "@playwright/test";
import { signInPage } from "../helpers";
import { TEST_ADMIN } from "../users";

test("agent config is one admin page, and the old prompt pages lead to it", async ({
  page,
}) => {
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto("/admin/users");
  // Account and admin settings are separate cards.
  const admin = page.getByRole("navigation", { name: "Admin" });
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(admin.getByRole("link", { name: "Agent config" })).toBeVisible();
  await expect(admin.getByRole("link", { name: "API keys" })).toHaveCount(0);
  await expect(account.getByRole("link", { name: "API keys" })).toBeVisible();
  await expect(account.getByRole("link", { name: "Users" })).toHaveCount(0);
  await admin.getByRole("link", { name: "Agent config", exact: true }).click();
  await expect(page).toHaveURL("/admin/agent");
  for (const heading of [
    "Pull request processing",
    "Model",
    "Session prompt",
    "Processing prompt",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  for (const old of ["/admin/review", "/admin/session-prompt"]) {
    await page.goto(old);
    await expect(page).toHaveURL("/admin/agent");
  }
});

test("a long prompt shows its first lines, scrolling, until expanded", async ({
  page,
}) => {
  await openAgentConfig(page);
  const card = section(page, "Session prompt");
  const preview = card.locator("pre").first();
  const folded = (await preview.boundingBox())!.height;
  // Folded, the rest of the prompt scrolls into view.
  await preview.hover();
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => preview.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await card.getByRole("button", { name: "Expand" }).click();
  await expect
    .poll(async () => (await preview.boundingBox())!.height)
    .toBeGreaterThan(folded);
  await card.getByRole("button", { name: "Collapse" }).click();
  await expect
    .poll(async () => (await preview.boundingBox())!.height)
    .toBe(folded);
});

test("an admin edits the processing prompt and restores the default", async ({
  page,
}) => {
  await openAgentConfig(page);
  await editPrompt(page, {
    prompt: "Processing prompt",
    slot: "{{submitUrl}}",
  });
});

test("an admin edits the session prompt, with branches for Claude and server grouping", async ({
  page,
}) => {
  await openAgentConfig(page);
  const card = section(page, "Session prompt");
  await expect(card.locator("pre").first()).toContainText("{{#if claude}}");
  await expect(card.locator("pre").first()).toContainText(
    "{{#if serverGroups}}",
  );
  await card.getByRole("button", { name: "Edit the session prompt" }).click();
  const dialog = page.getByRole("dialog");
  for (const name of [
    "{{#if claude}}",
    "{{#if serverGroups}}",
    "{{transcriptsUrl}}",
  ]) {
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await editPrompt(page, {
    prompt: "Session prompt",
    slot: "{{transcriptsUrl}}",
  });
});

// Local dev has no Workers AI, so the server cannot group here.
test("without Workers AI, agents group and the server cannot be chosen", async ({
  page,
}) => {
  await openAgentConfig(page);
  await expect(page.getByLabel("The agent that opened it")).toBeChecked();
  await expect(page.getByLabel("This server, with Workers AI")).toBeDisabled();
  await expect(
    page.getByText("Workers AI is not bound on this deployment."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Test model" })).toBeDisabled();
  await expect(page.getByLabel("AI Gateway")).toHaveAttribute(
    "placeholder",
    "default",
  );
});

test("an admin sets the model, the AI Gateway and the transcript limit", async ({
  page,
}) => {
  await openAgentConfig(page);
  const model = page.getByRole("textbox", { name: "Model" });
  const gateway = page.getByLabel("AI Gateway");
  const limit = page.getByLabel("Transcript limit");
  await expect(limit).toHaveValue("20,000 words");
  const defaultModel = await model.inputValue();
  const save = section(page, "Model").getByRole("button", {
    name: "Save",
    exact: true,
  });

  await model.fill("@cf/zai-org/glm-5.3");
  await gateway.fill("Not An Id");
  await gateway.blur();
  await expect(
    page.getByText("Lowercase letters, digits and dashes"),
  ).toBeVisible();
  await gateway.fill("reviews");
  await limit.fill("5000");
  await save.click();
  await page.reload();
  await expect(model).toHaveValue("@cf/zai-org/glm-5.3");
  await expect(gateway).toHaveValue("reviews");
  await expect(limit).toHaveValue("5,000 words");

  // The config is instance-wide: leave the defaults for other tests.
  await model.fill(defaultModel);
  await gateway.fill("");
  await limit.fill("20000");
  await save.click();
  await page.reload();
  await expect(model).toHaveValue(defaultModel);
  await expect(gateway).toHaveValue("");
  await expect(limit).toHaveValue("20,000 words");
});

test("the processing prompt follows the chosen way, and an edited one is kept with a warning", async ({
  page,
}) => {
  await serverAvailable(page);
  await openAgentConfig(page);
  const prompt = section(page, "Processing prompt").locator("pre").first();
  await expect(prompt).toContainText("{{submitUrl}}");

  // Unsaved, the server's default shows; back on agents, theirs.
  await page.getByLabel("This server, with Workers AI").check();
  await expect(prompt).toContainText("{{changes}}");
  await expect(page.getByText("The processing prompt was edited")).toHaveCount(
    0,
  );
  await page.getByLabel("The agent that opened it").check();
  await expect(prompt).toContainText("{{submitUrl}}");

  // An edited prompt stays when switching, with a warning that offers the
  // other way's default.
  const custom = "Group pull request #{{number}} and PUT it to {{submitUrl}}.";
  await section(page, "Processing prompt")
    .getByRole("button", { name: "Edit the processing prompt" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Processing prompt", { exact: true })
    .fill(custom);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(prompt).toHaveText(custom);
  await page.getByLabel("This server, with Workers AI").check();
  await expect(prompt).toHaveText(custom);
  const warning = page.getByRole("alert").filter({
    hasText: "The processing prompt was edited",
  });
  await expect(warning).toContainText("may not suit the server's model");
  await warning.getByRole("button", { name: "Use the server default" }).click();
  await expect(warning).toHaveCount(0);
  await expect(prompt).toContainText("{{changes}}");
  await page.getByLabel("The agent that opened it").check();
  await expect(prompt).toContainText("{{submitUrl}}");
});

test("with the bindings in place, models are suggested and tested", async ({
  page,
}) => {
  await serverAvailable(page);
  await page.route("**/api/admin/settings/agent-config/models?**", (route) =>
    route.fulfill({
      json: [
        { name: "@cf/zai-org/glm-5.3", description: "Agentic coding" },
        { name: "@cf/zai-org/glm-5.3-flash", description: "Fast and cheap" },
      ],
    }),
  );
  await openAgentConfig(page);
  await expect(page.getByLabel("This server, with Workers AI")).toBeEnabled();

  const model = page.getByRole("textbox", { name: "Model" });
  await model.fill("glm 5.3");
  await page.getByRole("option", { name: /glm-5\.3-flash/ }).click();
  await expect(model).toHaveValue("@cf/zai-org/glm-5.3-flash");

  // Local dev has no Workers AI, so the test reaches the server and fails
  // there, and the failure is kept as the last test.
  await page.getByRole("button", { name: "Test model" }).click();
  const result = page.getByRole("status").filter({ hasText: "failed" });
  await expect(result).toContainText(
    "failed: Workers AI is not bound on this deployment",
  );
  await expect(result).toContainText("through default");
  await page.reload();
  await expect(result).toContainText("tested");
});

const openAgentConfig = async (page: Page) => {
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto("/admin/agent");
};

// Answers the agent config as if the deployment had the AI bindings.
const serverAvailable = (page: Page) =>
  page.route("**/api/admin/settings/agent-config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), serverAvailable: true },
    });
  });

// A section of the page, by its heading.
const section = (page: Page, heading: string) =>
  page
    .locator(".mantine-Paper-root")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

// Opens a prompt's editor, replaces the prompt, and restores the default.
async function editPrompt(
  page: Page,
  { prompt, slot }: { prompt: string; slot: string },
) {
  const card = section(page, prompt);
  const preview = card.locator("pre").first();
  const edit = card.getByRole("button", {
    name: `Edit the ${prompt.toLowerCase()}`,
  });
  await expect(card.getByText("Using the built-in default.")).toBeVisible();
  await expect(preview).toContainText(slot);

  await edit.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Placeholders and conditions")).toBeVisible();
  await expect(dialog.getByText(slot, { exact: true })).toBeVisible();
  const editor = dialog.getByLabel(prompt, { exact: true });
  const original = await editor.inputValue();
  const custom = `Group pull request #{{number}}. ${slot}`;
  await editor.fill(custom);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByText(/^Customized/)).toBeVisible();
  await expect(preview).toHaveText(custom);

  await edit.click();
  await expect(dialog.getByLabel(prompt, { exact: true })).toHaveValue(custom);
  await dialog.getByRole("button", { name: "Restore default" }).click();
  await expect(card.getByText("Using the built-in default.")).toBeVisible();
  await expect(preview).toHaveText(original);
}
