import { test, expect, type Page } from "@playwright/test";
import { API, ORIGIN_HEADER, json, signInApi, signInPage } from "../helpers";
import { TEST_ADMIN, TEST_USER } from "../users";
import { GITHUB_FIXTURE } from "./fixture";

const f = GITHUB_FIXTURE;
const fromGithub = `/api/repositories/${f.repository}/pull-requests/from-github`;

// Local dev has no Workers AI, so the server never groups here: the button
// stays hidden, and opening one is refused before GitHub is asked.
test("without server processing, a connected repository offers no pull request from GitHub", async ({
  page,
  request,
}) => {
  await signInApi(request, TEST_ADMIN);
  expect(await json(await request.get(`${API}${fromGithub}`))).toEqual({
    available: false,
  });
  const refused = await request.post(`${API}${fromGithub}`, {
    data: {
      source: {
        kind: "branch",
        branch: "feature/login",
        targetBranch: "main",
        title: "Login",
      },
    },
    headers: ORIGIN_HEADER,
  });
  expect(refused.status()).toBe(400);
  expect(await refused.text()).toContain(
    "Pull requests open from GitHub only while this server groups them",
  );

  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(`/r/${f.repository}/pulls`);
  await expect(
    page.getByRole("heading", { name: "Pull requests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open from GitHub" }),
  ).toHaveCount(0);
});

test("only someone with Write may open a pull request from GitHub", async ({
  request,
}) => {
  await signInApi(request, TEST_USER);
  expect(await json(await request.get(`${API}${fromGithub}`))).toEqual({
    available: false,
  });
  const refused = await request.post(`${API}${fromGithub}`, {
    data: { source: { kind: "pull", number: 31 } },
    headers: ORIGIN_HEADER,
  });
  expect(refused.status()).toBe(403);
});

test("an open GitHub pull request or a branch is picked to open one from", async ({
  page,
}) => {
  await serverGroups(page);
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
  await page.goto(`/r/${f.repository}/pulls`);
  await page.getByRole("button", { name: "Open from GitHub" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Open a pull request from GitHub",
  });

  await dialog.getByRole("textbox", { name: "GitHub pull request" }).click();
  await expect(
    page.getByRole("option", {
      name: "#41 Add sign-up (feature/signup → main)",
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await dialog.getByText("Branch", { exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Merge into" })).toHaveValue(
    "main",
  );
  await dialog.getByRole("textbox", { name: "Branch" }).click();
  await page.getByRole("option", { name: "feature/signup" }).click();
  await dialog.getByLabel("Title").fill("Sign-up");
  await dialog.getByRole("button", { name: "Import" }).click();
  // The page was told the server groups, but the server itself does not.
  await expect(dialog).toContainText(
    "Pull requests open from GitHub only while this server groups them",
  );
});

// Answers as if the server grouped pull requests, with one open GitHub pull
// request and the branches it would have synced.
async function serverGroups(page: Page) {
  await page.route(`**${fromGithub}`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { available: true } })
      : route.fallback(),
  );
  await page.route(`**${fromGithub}/pulls`, (route) =>
    route.fulfill({
      json: [
        {
          number: 41,
          title: "Add sign-up",
          branch: "feature/signup",
          targetBranch: "main",
          url: `https://github.com/${f.owner}/${f.repo}/pull/41`,
          author: "octocat",
        },
      ],
    }),
  );
  await page.route(`**/api/repositories/${f.repository}/branches`, (route) =>
    route.fulfill({
      json: [
        { name: "main", commit: "a".repeat(40), isDefault: true },
        { name: "feature/signup", commit: "b".repeat(40), isDefault: false },
      ],
    }),
  );
}
