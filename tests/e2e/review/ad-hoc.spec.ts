import { test, expect } from "@playwright/test";
import { API, ORIGIN_HEADER, json, signInApi, signInPage } from "../helpers";
import { TEST_ADMIN } from "../users";
import { RULES_FIXTURE as f } from "./rules-fixture";

const chatApi = `${API}/api/repositories/${f.repository}/pull-requests/${f.number}/chat`;

// Local dev has no Workers AI, so the server never processes pull requests
// here, and ad hoc questions are refused before anything is stored.
test("without server processing, ad hoc is not offered and a question is refused", async ({
  request,
}) => {
  await signInApi(request, TEST_ADMIN);
  const agents = await json<{ adHoc: boolean }[]>(await request.get(chatApi));
  expect(agents.some((a) => a.adHoc)).toBe(false);
  const refused = await request.post(`${chatApi}/ad-hoc`, {
    data: { body: "What does total do?" },
    headers: ORIGIN_HEADER,
  });
  expect(refused.status()).toBe(400);
  expect(await refused.text()).toContain(
    "Ad hoc questions are answered only while this server processes pull requests",
  );
  expect(await json(await request.get(`${chatApi}/ad-hoc`))).toEqual([]);
});

test("with no agent listening, the chat opens on ad hoc when the server answers", async ({
  page,
}) => {
  // As the list reads while the server processes pull requests.
  await page.route(`**/pull-requests/${f.number}/chat`, (route) =>
    route.fulfill({
      json: [
        {
          channel: "ad-hoc",
          agent: { id: "ad-hoc", name: "Ad hoc" },
          madeThis: false,
          adHoc: true,
          live: true,
          lastSeenAt: null,
        },
      ],
    }),
  );
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(`/r/${f.repository}/pulls/${f.number}`);
  await page.getByText("Ask Ad hoc about this change…").click();
  const panel = page.getByRole("region", { name: "Chat" });
  await expect(panel).toContainText(
    "This server's model answers, with the diff, its brackets and the agent's transcripts",
  );
  await panel.getByRole("button", { name: /^Who to talk to/ }).click();
  const adHoc = page.getByRole("menuitem", { name: /Ad hoc/ });
  await expect(adHoc).toBeEnabled();
  await expect(adHoc).toContainText(
    "This server answers, with the change and its transcripts",
  );
});
