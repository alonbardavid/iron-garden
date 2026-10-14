import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteRefs, mirrorBranches, planUpdates } from "./mirror";
import { gitIn, gitServer, remote } from "./testing/git-server";

describe("mirrorBranches", () => {
  let root: string;
  const git = gitIn(() => root);
  const commit = (message: string) =>
    git("source", "commit", "--allow-empty", "-q", "-m", message);
  const branchesOf = (dir: string) =>
    git(
      dir,
      "for-each-ref",
      "--format=%(refname:short) %(objectname)",
      "refs/heads",
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "mirror-"));
    execFileSync("git", ["init", "-q", "-b", "main", join(root, "source")]);
    execFileSync("git", [
      "init",
      "-q",
      "--bare",
      "-b",
      "main",
      join(root, "target"),
    ]);
    commit("first");
    git("source", "branch", "feature");
    commit("second");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("copies every branch into an empty repository", async () => {
    const { fetcher } = gitServer(root);
    const updates = await mirrorBranches(
      remote("source"),
      remote("target"),
      {},
      fetcher,
    );
    expect(updates.map((u) => [u.branch, u.from])).toEqual([
      ["feature", null],
      ["main", null],
    ]);
    expect(branchesOf("target")).toBe(branchesOf("source"));
    git("target", "fsck", "--strict");
  });

  it("moves, force-moves, creates and deletes branches on later runs", async () => {
    const { fetcher } = gitServer(root);
    git("source", "branch", "gone");
    await mirrorBranches(remote("source"), remote("target"), {}, fetcher);
    commit("third");
    const tree = git("source", "rev-parse", "HEAD^{tree}");
    const orphan = git("source", "commit-tree", tree, "-m", "rewritten");
    git("source", "branch", "-f", "feature", orphan);
    git("source", "branch", "-D", "gone");
    git("source", "branch", "added", "HEAD~1");

    const updates = await mirrorBranches(
      remote("source"),
      remote("target"),
      { only: ["main", "feature", "gone", "added"] },
      fetcher,
    );
    expect(updates.map((u) => [u.branch, !!u.from, !!u.to])).toEqual([
      ["main", true, true],
      ["feature", true, true],
      ["gone", true, false],
      ["added", false, true],
    ]);
    expect(branchesOf("target")).toBe(branchesOf("source"));
    git("target", "fsck", "--strict");
  });

  it("asks for nothing when the branches already match", async () => {
    const { fetcher, requests } = gitServer(root);
    await mirrorBranches(remote("source"), remote("target"), {}, fetcher);
    requests.length = 0;
    expect(
      await mirrorBranches(remote("source"), remote("target"), {}, fetcher),
    ).toEqual([]);
    expect(requests).toEqual(["GET info/refs", "GET info/refs"]);
  });

  it("deletes without sending a pack", async () => {
    const { fetcher, requests } = gitServer(root);
    await mirrorBranches(remote("source"), remote("target"), {}, fetcher);
    git("source", "branch", "-D", "feature");
    requests.length = 0;
    await mirrorBranches(
      remote("source"),
      remote("target"),
      { only: ["feature"] },
      fetcher,
    );
    expect(requests).not.toContain("POST git-upload-pack");
    expect(branchesOf("target")).toBe(branchesOf("source"));
  });
});

describe("deleteRefs", () => {
  let root: string;
  const git = gitIn(() => root);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "delete-"));
    execFileSync("git", [
      "init",
      "-q",
      "--bare",
      "-b",
      "main",
      join(root, "target"),
    ]);
    execFileSync("git", ["init", "-q", "-b", "main", join(root, "work")]);
    git("work", "commit", "--allow-empty", "-q", "-m", "first");
    git(
      "work",
      "-c",
      "push.negotiate=false",
      "push",
      "-q",
      join(root, "target"),
      "main",
      "main:gone",
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("deletes the refs the target has and skips the rest", async () => {
    const deleted = await deleteRefs(
      remote("target"),
      ["refs/heads/gone", "refs/heads/never"],
      gitServer(root).fetcher,
    );
    expect(deleted).toEqual(["refs/heads/gone"]);
    expect(git("target", "for-each-ref", "--format=%(refname)")).toBe(
      "refs/heads/main",
    );
  });
});

describe("planUpdates", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  const refs = (entries: Record<string, string>) =>
    new Map(Object.entries(entries).map(([k, v]) => [`refs/heads/${k}`, v]));

  it("never deletes on a full run", () => {
    expect(planUpdates(refs({ main: a }), refs({ main: a, local: b }))).toEqual(
      [],
    );
  });

  it("ignores a named branch neither side has", () => {
    expect(planUpdates(refs({}), refs({}), ["gone"])).toEqual([]);
  });
});
