import { test, expect } from "@playwright/test";

test("backend /api/health returns ok", async ({ request }) => {
  const res = await request.get("http://localhost:8301/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.checks.database.status).toBe("ok");
});
