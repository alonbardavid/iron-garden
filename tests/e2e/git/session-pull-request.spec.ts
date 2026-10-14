import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API, json, signInApi, unique } from "../helpers";
import { TEST_ADMIN } from "../users";

// Real git against real Cloudflare Artifacts: runs only when the backend binds
// an Artifacts namespace (ARTIFACTS_NAMESPACE, see docs/development.md).
test.skip(!process.env.ARTIFACTS_NAMESPACE, "needs ARTIFACTS_NAMESPACE");

test.describe.configure({ mode: "serial" });

test("an agent starts a session, pushes a branch and groups its pull request", async ({
  request,
}) => {
  test.setTimeout(180_000);
  await signInApi(request, TEST_ADMIN);
  const repository = unique("art");
  await json(
    await request.post(`${API}/api/repositories`, {
      data: { name: repository },
    }),
  );
  try {
    await pushFirstCommit(request, repository);
    const agentKey = await agentWithWriteAccess(request, repository);
    const headers = { "x-api-key": agentKey };

    const started = await json<StartedSession>(
      await request.post(`${API}/api/sessions`, {
        headers,
        data: { repository, title: "Add a greeting", goal: "Say hello" },
      }),
    );
    expect(started.git.baseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(started.instructions).toContain(started.links.pullRequests);
    expect(started.instructions).toContain("## 4. Share your transcript");

    // Claude outlines its work instead of handing over a transcript.
    const claude = await json<StartedSession>(
      await request.post(`${API}/api/sessions`, {
        headers,
        data: { repository, client: "claude-code", title: "Outline" },
      }),
    );
    expect(claude.instructions).toContain(
      "## 4. Outline how you made each commit",
    );
    expect(claude.instructions).not.toContain("Share your transcript");

    const work = clone(started.git.remote, started.git.token);
    git(work, "checkout", "-b", "greeting");
    writeFileSync(join(work, "hello.txt"), "hello\nworld\n");
    git(work, "add", ".");
    git(work, "commit", "-m", "Add a greeting");
    git(work, ...auth(started.git.token), "push", "origin", "greeting");

    const created = await json<CreatedPullRequest>(
      await request.post(started.links.pullRequests, {
        headers,
        data: { branch: "greeting", title: "Add a greeting" },
      }),
    );
    expect(created.pullRequest.status).toBe("processing");
    expect(created.pullRequest.files).toEqual([
      { path: "hello.txt", change: "added", oldLines: 0, newLines: 2 },
    ]);
    expect(created.grouping.prompt).toContain(created.grouping.submitUrl);

    const outOfRange = await request.put(created.grouping.submitUrl, {
      headers,
      data: { groups: [group({ start: 1, end: 9 })] },
    });
    expect(outOfRange.status()).toBe(400);

    const grouped = await json<{ status: string; groups: unknown[] }>(
      await request.put(created.grouping.submitUrl, {
        headers,
        data: { groups: [group({ start: 1, end: 2 })] },
      }),
    );
    expect(grouped.status).toBe("open");
    expect(grouped.groups).toHaveLength(1);

    // The worker diffs the file from git to count its changes; only people
    // accept them.
    const reviewUrl = `${API}/api/repositories/${repository}/pull-requests/${created.pullRequest.number}/review`;
    const review = await json<Review>(await request.get(reviewUrl));
    expect(review.files).toEqual([
      {
        path: "hello.txt",
        changes: [
          { key: expect.any(String), at: 1 },
          { key: expect.any(String), at: 2 },
        ],
        accepted: [],
      },
    ]);
    const first = review.files[0]!.changes[0]!.key;
    const accept = {
      accepted: true,
      changes: [{ path: "hello.txt", keys: [first] }],
    };
    expect(
      (await request.put(reviewUrl, { headers, data: accept })).status(),
    ).toBe(403);
    await json(await request.put(reviewUrl, { data: accept }));

    const listed = await json<{ number: number; status: string }[]>(
      await request.get(`${API}/api/repositories/${repository}/pull-requests`),
    );
    expect(listed).toEqual([
      expect.objectContaining({
        number: created.pullRequest.number,
        status: "open",
        review: { changes: 2, accepted: 1 },
      }),
    ]);
  } finally {
    await request.delete(`${API}/api/repositories/${repository}`);
  }
});

interface StartedSession {
  git: { remote: string; token: string; baseCommit: string | null };
  instructions: string;
  links: { pullRequests: string };
}

interface Review {
  files: { path: string; changes: { key: string; at: number }[] }[];
}

interface CreatedPullRequest {
  pullRequest: { number: number; status: string; files: unknown[] };
  grouping: { prompt: string; submitUrl: string };
}

const group = (lines: { start: number; end: number }) => ({
  title: "Greeting",
  kind: "flow",
  ranges: [{ path: "hello.txt", ...lines }],
});

// The admin pushes the first commit through the Worker's git proxy, with a
// personal key as the password.
async function pushFirstCommit(request: APIRequestContext, repository: string) {
  const { plaintext } = await json<{ plaintext: string }>(
    await request.post(`${API}/api/account/keys`, {
      data: { name: unique("git"), expiresInDays: 30 },
    }),
  );
  const dir = mkdtempSync(join(tmpdir(), "cg-first-"));
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "README.md"), `# ${repository}\n`);
  git(dir, "add", ".");
  git(dir, "commit", "-m", "First commit");
  const remote = `http://${TEST_ADMIN.username}:${plaintext}@localhost:8301/${repository}.git`;
  git(dir, "push", remote, "main");
}

async function agentWithWriteAccess(
  request: APIRequestContext,
  repository: string,
) {
  const name = unique("agent");
  await json(await request.post(`${API}/api/agents`, { data: { name } }));
  await json(
    await request.put(`${API}/api/agents/${name}/access/${repository}`, {
      data: { level: "write" },
    }),
  );
  const { plaintext } = await json<{ plaintext: string }>(
    await request.post(`${API}/api/agents/${name}/keys`, {
      data: { name: "e2e", expiresInDays: 30 },
    }),
  );
  return plaintext;
}

function clone(remote: string, token: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cg-session-"));
  execFileSync("git", [...auth(token), "clone", remote, dir], {
    stdio: "pipe",
  });
  git(dir, "config", "user.email", "agent@example.com");
  git(dir, "config", "user.name", "Agent");
  return dir;
}

const auth = (token: string) => [
  "-c",
  `http.extraHeader=Authorization: Bearer ${token}`,
];

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "E2E",
      GIT_AUTHOR_EMAIL: "e2e@example.com",
      GIT_COMMITTER_NAME: "E2E",
      GIT_COMMITTER_EMAIL: "e2e@example.com",
    },
  });
}
