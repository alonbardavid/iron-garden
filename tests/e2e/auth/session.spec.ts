import { test, expect } from "@playwright/test";
import { API, signInApi } from "../helpers";
import { TEST_ADMIN, TEST_USER } from "../users";

test.describe("API session", () => {
  test("a signed-in user is served their own record", async ({ request }) => {
    await signInApi(request, TEST_USER);
    const me = await request.get(`${API}/api/me`);
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      email: TEST_USER.email,
      name: TEST_USER.name,
      username: TEST_USER.username,
      role: "user",
      mustChangePassword: false,
      agent: null,
    });
  });

  test("a signed-out request is rejected", async ({ request }) => {
    const me = await request.get(`${API}/api/me`);
    expect(me.status()).toBe(401);
    expect(await me.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("admin procedures refuse a user and serve an admin", async ({
    playwright,
  }) => {
    for (const [user, status] of [
      [TEST_USER, 403],
      [TEST_ADMIN, 200],
    ] as const) {
      const request = await playwright.request.newContext();
      await signInApi(request, user);
      for (const path of [
        "agent-config",
        "processing-prompt?mode=agent",
        "session-prompt",
      ]) {
        const res = await request.get(`${API}/api/admin/settings/${path}`);
        expect(res.status()).toBe(status);
      }
      await request.dispose();
    }
  });

  test("setup is closed once an admin exists", async ({ request }) => {
    const state = await request.get(`${API}/api/setup`);
    expect(await state.json()).toEqual({ state: "closed" });
    const create = await request.post(`${API}/api/setup`, {
      data: {
        token: "local-dev-setup-token-7c41e9a2b85d",
        username: "late-admin",
        name: "Late",
        email: "late@example.com",
        password: "late-admin-password",
      },
    });
    expect(create.status()).toBe(409);
  });
});
