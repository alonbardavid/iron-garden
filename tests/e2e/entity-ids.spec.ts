import { test, expect } from "@playwright/test";
import { API, APP_ORIGIN, json, signInApi, unique } from "./helpers";
import { TEST_USER } from "./users";

const NANOID = "[A-Za-z0-9_-]{21}";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

test("ids carry their entity's uppercase prefix", async ({ request }) => {
  await signInApi(request, TEST_USER);
  const session = await json<{ user: { id: string }; session: { id: string } }>(
    await request.get(`${API}/api/auth/get-session`, {
      headers: { origin: APP_ORIGIN },
    }),
  );
  expect(session.user.id).toMatch(new RegExp(`^U_${NANOID}$`));
  expect(session.session.id).toMatch(new RegExp(`^US_${UUID}$`));

  const agent = await json<{ id: string }>(
    await request.post(`${API}/api/agents`, { data: { name: unique("ids") } }),
  );
  expect(agent.id).toMatch(/^AGT_/);
});
