import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, ORIGIN_HEADER, json, signInApi, unique } from "../helpers";
import { TEST_ADMIN } from "../users";
import { pagedRepository } from "./fixture";

interface Page<Item> {
  items: Item[];
  nextCursor: string | null;
}

const numbered = (prefix: string, n: number) =>
  `${prefix}-${String(n).padStart(2, "0")}`;

test.describe("paged people and access", () => {
  test("a page of agents holds 20 by name, and its cursor reads the rest", async ({
    request,
  }) => {
    await signInApi(request, TEST_ADMIN);
    const prefix = unique("pg");
    for (let n = 1; n <= 22; n++) {
      await json(
        await request.post(`${API}/api/agents`, {
          data: { name: numbered(prefix, n) },
        }),
      );
    }
    const list = async (cursor?: string) =>
      json<Page<{ name: string }>>(
        await request.get(`${API}/api/agents`, {
          params: { q: prefix, ...(cursor ? { cursor } : {}) },
        }),
      );
    const first = await list();
    expect(first.items.map((a) => a.name)).toEqual(
      Array.from({ length: 20 }, (_, i) => numbered(prefix, i + 1)),
    );
    expect(first.nextCursor).not.toBeNull();
    const rest = await list(first.nextCursor!);
    expect(rest.items.map((a) => a.name)).toEqual([
      numbered(prefix, 21),
      numbered(prefix, 22),
    ]);
    expect(rest.nextCursor).toBeNull();
  });

  test("user and member searches answer at most 5, and members page by name", async ({
    request,
  }) => {
    await signInApi(request, TEST_ADMIN);
    // Named to sort after everyone else, so they never push a user the admin
    // screen tests look for off its first page.
    const token = unique("zz");
    const ids = await createUsers(request, token, 6);
    const repository = pagedRepository(1);
    for (const userId of ids) {
      await json(
        await request.put(
          `${API}/api/repositories/${repository}/members/${userId}`,
          { data: { level: "read" } },
        ),
      );
    }
    const names = ids.map((_, i) => `Zz ${token} ${i + 1}`);

    const users = await json<{ name: string }[]>(
      await request.get(`${API}/api/search/users`, { params: { q: token } }),
    );
    expect(users.map((u) => u.name)).toEqual(names.slice(0, 5));

    const members = await json<{ user: { name: string } }[]>(
      await request.get(
        `${API}/api/repositories/${repository}/members/search`,
        { params: { q: token } },
      ),
    );
    expect(members.map((m) => m.user.name)).toEqual(names.slice(0, 5));

    const listed: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page: Page<{ user: { name: string } }> = await json(
        await request.get(`${API}/api/repositories/${repository}/members`, {
          params: { limit: 4, ...(cursor ? { cursor } : {}) },
        }),
      );
      expect(page.items.length).toBeLessThanOrEqual(4);
      listed.push(...page.items.map((m) => m.user.name));
      cursor = page.nextCursor;
    } while (cursor);
    expect(listed.filter((name) => name.includes(token))).toEqual(names);
  });
});

async function createUsers(
  request: APIRequestContext,
  token: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 1; n <= count; n++) {
    const username = `${token}-${n}`;
    const created = await json<{ user: { id: string } }>(
      await request.post(`${API}/api/auth/admin/create-user`, {
        data: {
          email: `${username}@example.com`,
          password: "listing-pass-123",
          name: `Zz ${token} ${n}`,
          data: { username },
        },
        headers: ORIGIN_HEADER,
      }),
    );
    ids.push(created.user.id);
  }
  return ids;
}
