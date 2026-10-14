import { test, expect, type APIRequestContext } from "@playwright/test";
import { API, json, signInApi, signInPage, unique } from "../helpers";
import { TEST_USER } from "../users";

test.describe("API keys and agents", () => {
  test("a personal key is shown once and works as a credential", async ({
    page,
    request,
  }) => {
    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await page.goto("/account/keys");
    await page.getByRole("button", { name: "New key" }).click();
    const name = unique("laptop");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(
      page.getByRole("heading", { name: "Copy your key now" }),
    ).toBeVisible();
    const key = await page
      .getByRole("dialog", { name: "Copy your key now" })
      .getByRole("textbox")
      .inputValue();
    expect(key).toMatch(/^cgit_pat_/);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(name)).toBeVisible();

    const me = await json(
      await request.get(`${API}/api/me`, { headers: { "x-api-key": key } }),
    );
    expect(me).toMatchObject({ username: TEST_USER.username, agent: null });
  });

  test("an agent key acts as the agent and cannot manage identities", async ({
    page,
    request,
  }) => {
    await signInPage(page, TEST_USER.username, TEST_USER.password);
    await page.goto("/account/agents");
    await page.getByRole("button", { name: "New agent" }).click();
    const name = unique("bot");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create agent" }).click();
    await expect(
      page.getByRole("heading", { name: "Repository access" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "New key" }).click();
    await page.getByLabel("Name", { exact: true }).fill("ci");
    await page.getByRole("button", { name: "Create key" }).click();
    const key = await page
      .getByRole("dialog", { name: "Copy your key now" })
      .getByRole("textbox")
      .inputValue();
    expect(key).toMatch(/^cgit_agt_/);

    const headers = { "x-api-key": key };
    const me = await json(await request.get(`${API}/api/me`, { headers }));
    expect(me).toMatchObject({ username: TEST_USER.username, agent: { name } });
    const agents = await request.get(`${API}/api/agents`, { headers });
    expect(agents.status()).toBe(403);
  });

  test("sessions are for agents only", async ({ request }) => {
    await signInApi(request, TEST_USER);
    const res = await request.post(`${API}/api/sessions`, {
      data: { repository: "anything" },
    });
    expect(res.status()).toBe(403);
  });

  test("a revoked key stops working at once", async ({ request }) => {
    await signInApi(request, TEST_USER);
    const created = await createPersonalKey(request);
    await json(
      await request.delete(`${API}/api/account/keys/${created.key.id}`),
    );
    const me = await request.get(`${API}/api/me`, {
      headers: { "x-api-key": created.plaintext },
    });
    expect(me.status()).toBe(401);
  });

  test("keys cannot be minted through better-auth's client endpoints", async ({
    request,
  }) => {
    await signInApi(request, TEST_USER);
    const res = await request.post(`${API}/api/auth/api-key/create`, {
      data: { name: "sneaky", metadata: { kind: "agent", agentId: "AGT_x" } },
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.status()).toBe(403);
  });
});

async function createPersonalKey(request: APIRequestContext) {
  return json<{ key: { id: string }; plaintext: string }>(
    await request.post(`${API}/api/account/keys`, {
      data: { name: unique("key"), expiresInDays: 30 },
    }),
  );
}
