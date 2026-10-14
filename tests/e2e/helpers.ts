import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = "http://localhost:8301";
export const APP_ORIGIN = "http://localhost:5173";

// better-auth checks the origin of cookie-authenticated writes.
export const ORIGIN_HEADER = { origin: APP_ORIGIN };

export async function signInApi(
  request: APIRequestContext,
  login: { username: string; password: string },
) {
  const res = await request.post(`${API}/api/auth/sign-in/username`, {
    data: login,
    headers: ORIGIN_HEADER,
  });
  expect(res.status(), await res.text()).toBe(200);
}

export async function submitSignIn(
  page: Page,
  login: string,
  password: string,
) {
  await page.goto("/");
  await page.getByLabel("Username or email").fill(login);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Signs in and waits until the app has left the sign-in screen.
export async function signInPage(page: Page, login: string, password: string) {
  await submitSignIn(page, login, password);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeHidden();
}

// A name no other test or earlier run has used.
export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

export async function json<T = Record<string, unknown>>(
  res: Awaited<ReturnType<APIRequestContext["get"]>>,
): Promise<T> {
  expect(res.ok(), `${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}
