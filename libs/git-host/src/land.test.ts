import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { landBranch, type MergeMethod } from "./land";
import { transferRefs } from "./mirror";
import { gitIn, gitServer, remote } from "./testing/git-server";

const author = {
  name: "Lena <Reviewer>",
  email: "lena@example.com",
  at: new Date("2026-10-13T12:00:00Z"),
};

describe("landBranch", () => {
  let root: string;
  const git = gitIn(() => root);
  let base: string;
  let head: string;

  // A session fork with a two-commit branch, and the repository it lands in,
  // which has the fork's base on main and the branch as refs/pull/1/head.
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "land-"));
    execFileSync("git", ["init", "-q", "-b", "main", join(root, "fork")]);
    execFileSync("git", [
      "init",
      "-q",
      "--bare",
      "-b",
      "main",
      join(root, "main"),
    ]);
    git("fork", "commit", "--allow-empty", "-q", "-m", "base");
    base = git("fork", "rev-parse", "HEAD");
    git(
      "fork",
      "-c",
      "push.negotiate=false",
      "push",
      "-q",
      join(root, "main"),
      "main",
    );
    git("fork", "checkout", "-q", "-b", "feature");
    git("fork", "commit", "--allow-empty", "-q", "-m", "one");
    git("fork", "commit", "--allow-empty", "-q", "-m", "two");
    head = git("fork", "rev-parse", "HEAD");
    await transferRefs(
      remote("fork"),
      remote("main"),
      () => [{ ref: "refs/pull/1/head", from: null, to: head }],
      gitServer(root).fetcher,
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const land = (method: MergeMethod, expected: string | null = base) =>
    landBranch(
      remote("main"),
      {
        branch: "main",
        expected,
        head: {
          commit: head,
          tree: git("main", "rev-parse", `${head}^{tree}`),
        },
        method,
        message: "Ship the feature (#1)\n\nTwo commits.",
        author,
      },
      gitServer(root).fetcher,
    );

  it("merges with a merge commit on top of both", async () => {
    const tip = await land("merge");
    expect(git("main", "rev-parse", "main")).toBe(tip);
    expect(git("main", "log", "-1", "--format=%P", "main")).toBe(
      `${base} ${head}`,
    );
    expect(git("main", "log", "-1", "--format=%an <%ae>|%s", "main")).toBe(
      "Lena Reviewer <lena@example.com>|Ship the feature (#1)",
    );
    git("main", "fsck", "--strict");
  });

  it("squashes into one commit with head's tree", async () => {
    await land("squash");
    expect(git("main", "log", "-1", "--format=%P", "main")).toBe(base);
    expect(git("main", "rev-parse", "main^{tree}")).toBe(
      git("main", "rev-parse", `${head}^{tree}`),
    );
    expect(git("main", "rev-list", "--count", "main")).toBe("2");
    git("main", "fsck", "--strict");
  });

  it("rebases by moving the branch to head's own commits", async () => {
    expect(await land("rebase")).toBe(head);
    expect(git("main", "rev-parse", "main")).toBe(head);
  });

  it("refuses when the branch moved since it was read", async () => {
    await expect(land("squash", head)).rejects.toThrow(/rejected/);
    expect(git("main", "rev-parse", "main")).toBe(base);
  });
});
