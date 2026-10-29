import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, json, signInApi, signInPage } from "../helpers";
import { TEST_ADMIN } from "../users";
import {
  REVIEW_LISTING_FIXTURE as f,
  pagedPullStatus,
  pagedRule,
} from "./review-fixture";

interface Page<Item> {
  items: Item[];
  nextCursor: string | null;
}

const read = async <Item>(
  request: APIRequestContext,
  path: string,
  params: Record<string, string> = {},
) => json<Page<Item>>(await request.get(`${API}${path}`, { params }));

// n, n-1, …, down to and including `to`.
const countdown = (n: number, to: number) =>
  Array.from({ length: n - to + 1 }, (_, i) => n - i);

test.describe("paged pull requests and rules", () => {
  test.beforeEach(async ({ request }) => {
    await signInApi(request, TEST_ADMIN);
  });

  test("a page holds the 20 newest pull requests, and its cursor reads the rest", async ({
    request,
  }) => {
    const path = `/api/repositories/${f.repository}/pull-requests`;
    const first = await read<{ number: number }>(request, path);
    expect(first.items.map((pr) => pr.number)).toEqual(
      countdown(f.pullRequests, 6),
    );
    const rest = await read<{ number: number }>(request, path, {
      cursor: first.nextCursor!,
    });
    expect(rest.items.map((pr) => pr.number)).toEqual(countdown(5, 1));
    expect(rest.nextCursor).toBeNull();
  });

  test("the open filter keeps those still processing, and counts agree", async ({
    request,
  }) => {
    const path = `/api/repositories/${f.repository}/pull-requests`;
    const first = await read<{ number: number }>(request, path, {
      status: "open",
    });
    const rest = await read<{ number: number; status: string }>(request, path, {
      status: "open",
      cursor: first.nextCursor!,
    });
    expect(rest.items.map((pr) => [pr.number, pr.status])).toEqual(
      countdown(5, 3).map((n) => [n, pagedPullStatus(n)]),
    );
    expect(
      await json(
        await request.get(
          `${API}/api/repositories/${f.repository}/pull-requests/counts`,
        ),
      ),
    ).toEqual({ open: 23, processing: 1, merged: 1, closed: 1 });
  });

  test("a page holds the 20 oldest rules, and its cursor reads the rest", async ({
    request,
  }) => {
    const path = `/api/repositories/${f.repository}/rules`;
    const first = await read<{ name: string }>(request, path);
    expect(first.items.map((r) => r.name)).toEqual(
      Array.from({ length: 20 }, (_, i) => pagedRule(i + 1)),
    );
    const rest = await read<{ name: string }>(request, path, {
      cursor: first.nextCursor!,
    });
    expect(rest.items.map((r) => r.name)).toEqual(
      Array.from({ length: f.rules - 20 }, (_, i) => pagedRule(i + 21)),
    );
    expect(rest.nextCursor).toBeNull();
  });

  test("copyable rules say which are already here", async ({ request }) => {
    const page = await read<{ name: string; already: boolean }>(
      request,
      `/api/repositories/${f.copyTo}/rules/copyable`,
      { from: f.repository },
    );
    expect(page.items.map((r) => [r.name, r.already])).toEqual(
      Array.from({ length: 20 }, (_, i) => [pagedRule(i + 1), i === 0]),
    );
    expect(page.nextCursor).not.toBeNull();
  });

  test("the pull requests and rules screens show more on request", async ({
    page,
  }) => {
    await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
    await page.goto(`/r/${f.repository}/pulls`);
    await expect(
      page.getByRole("link", { name: /Pull requests/ }),
    ).toContainText("23");
    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(20);
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(rows).toHaveCount(23);

    await page.goto(`/r/${f.repository}/settings/rules`);
    const rules = page
      .getByRole("table", { name: "Rules" })
      .locator("tbody tr");
    await expect(rules).toHaveCount(20);
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(rules).toHaveCount(f.rules);
  });
});
