import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, json, signInApi, signInPage } from "../helpers";
import { TEST_ADMIN, TEST_USER } from "../users";
import { LISTING_FIXTURE as f, pagedRepository } from "./fixture";

interface Page {
  items: { name: string; level: string }[];
  nextCursor: string | null;
}

const listPaged = async (request: APIRequestContext, cursor?: string) =>
  json<Page>(
    await request.get(`${API}/api/repositories`, {
      params: { q: f.prefix, ...(cursor ? { cursor } : {}) },
    }),
  );

test.describe("paged repositories", () => {
  test("a page holds 20 by name, and its cursor reads the rest", async ({
    request,
  }) => {
    await signInApi(request, TEST_ADMIN);
    const first = await listPaged(request);
    expect(first.items.map((r) => r.name)).toEqual(
      Array.from({ length: 20 }, (_, i) => pagedRepository(i + 1)),
    );
    expect(first.nextCursor).not.toBeNull();
    const rest = await listPaged(request, first.nextCursor!);
    expect(rest.items.map((r) => r.name)).toEqual(
      Array.from({ length: f.repositories - 20 }, (_, i) =>
        pagedRepository(i + 21),
      ),
    );
    expect(rest.nextCursor).toBeNull();
  });

  test("a page holds only the repositories you can read", async ({
    request,
  }) => {
    await signInApi(request, TEST_USER);
    const page = await listPaged(request);
    expect(page.items).toEqual(
      Array.from({ length: f.memberOf }, (_, i) =>
        expect.objectContaining({
          name: pagedRepository(i + 1),
          level: "write",
        }),
      ),
    );
    expect(page.nextCursor).toBeNull();
  });

  test("the repository search answers at most 5", async ({ request }) => {
    await signInApi(request, TEST_ADMIN);
    const found = await json<{ name: string }[]>(
      await request.get(`${API}/api/search/repositories`, {
        params: { q: f.prefix },
      }),
    );
    expect(found.map((r) => r.name)).toEqual(
      Array.from({ length: 5 }, (_, i) => pagedRepository(i + 1)),
    );
  });

  test("the repositories screen shows more on request", async ({ page }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    const last = page.getByRole("link", {
      name: pagedRepository(f.repositories),
      exact: true,
    });
    await expect(
      page.getByRole("link", { name: pagedRepository(1) }),
    ).toBeVisible();
    // Each repository is a card linking to it, saying when it was updated.
    const cards = page
      .getByRole("link")
      .filter({ has: page.getByText(/^Updated /) });
    await expect(cards).toHaveCount(20);
    await expect(last).toBeHidden();
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(last).toBeVisible();
  });
});
