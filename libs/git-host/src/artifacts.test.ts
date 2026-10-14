import { describe, expect, it } from "vitest";
import { artifactsGitHost } from "./artifacts";

// Like a real binding, each repository stub answers a tick later and refuses
// every call once disposed.
function fakeArtifacts(
  trees: Record<string, { name: string; hash: string; type: string }[]>,
  blobs: Record<string, string>,
): Artifacts {
  return {
    async get() {
      let disposed = false;
      const answer = async <T>(value: T) => {
        if (disposed) {
          throw new Error("RPC stub used after being disposed");
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
        return value;
      };
      return {
        readTree: (hash: string) => answer(trees[hash] ?? null),
        readBlob: (hash: string) =>
          answer(blobs[hash] === undefined ? null : new Blob([blobs[hash]])),
        [Symbol.dispose]() {
          disposed = true;
        },
      };
    },
  } as unknown as Artifacts;
}

describe("artifactsGitHost.changedFiles", () => {
  it("reads every blob before releasing the repository", async () => {
    const names = Array.from({ length: 12 }, (_, i) => `f${i}.ts`);
    const tree = (version: string) =>
      names.map((name) => ({ name, hash: `${name}@${version}`, type: "blob" }));
    const blobs = Object.fromEntries(
      names.flatMap((name) => [
        [`${name}@1`, "one\n"],
        [`${name}@2`, "one\ntwo\n"],
      ]),
    );
    const git = artifactsGitHost(
      fakeArtifacts({ old: tree("1"), new: tree("2") }, blobs),
    );

    const files = await git.changedFiles(
      "repo",
      { commit: "c1", tree: "old" },
      { commit: "c2", tree: "new" },
    );

    expect(files).toHaveLength(12);
    expect(files.every((f) => f.oldLines === 1 && f.newLines === 2)).toBe(true);
  });
});
