import { moduleLogger } from "@lib/logging";
import {
  GitHostError,
  type ChangedFile,
  type Commit,
  type FileVersion,
  type GitHost,
  type PathFile,
} from "./host";
import { branchCommits } from "./commits";
import { imageTypeOf, toBase64 } from "./images";
import { mergeBase } from "./merge-base";
import { countLines, diffTrees, type TreeChange } from "./tree-diff";
import { parseRefAdvertisement } from "./refs";
import { readPath, walkFiles } from "./tree-path";
import { tokenExpiry } from "./token";

const log = moduleLogger("git-host/artifacts");

// A pull request bigger than this is refused rather than diffed: every changed
// file costs a blob read per side.
const MAX_CHANGED_FILES = 1000;
const BLOB_READ_CONCURRENCY = 8;
// Larger files are listed but neither shown nor diffed: the diff runs in the
// reviewer's browser and again in the worker to count the changes.
const MAX_SHOWN_FILE_BYTES = 1024 * 1024;
// Past this many directories a file listing stops: each one costs a read.
const MAX_LISTED_TREES = 2000;
// Long enough to read the ref advertisement once.
const REFS_TOKEN_TTL_SECONDS = 60;

export function artifactsGitHost(artifacts: Artifacts): GitHost {
  return {
    async create(name, { defaultBranch, description }) {
      await call(() =>
        artifacts.create(name, {
          setDefaultBranch: defaultBranch,
          description,
        }),
      );
      log.info("repository created", { artifactsName: name });
    },

    async delete(name) {
      await call(() => artifacts.delete(name));
      log.info("repository deleted", { artifactsName: name });
    },

    // The fork's own write token comes back with it, so the caller can hand
    // it out before the fork has finished copying.
    async fork(source, target, description) {
      using repo = await call(() => artifacts.get(source));
      const forked = await call(() =>
        repo.fork(target, { description, defaultBranchOnly: true }),
      );
      log.info("repository forked", { from: source, artifactsName: target });
      return {
        remote: forked.remote,
        token: { token: forked.token, expiresAt: tokenExpiry(forked.token) },
      };
    },

    async remote(name) {
      using repo = await call(() => artifacts.get(name));
      return (await call(() => repo.info())).remote;
    },

    async gitRemote(name, scope, ttlSeconds) {
      using repo = await call(() => artifacts.get(name));
      const [{ remote }, token] = await Promise.all([
        call(() => repo.info()),
        call(() => repo.createToken(scope, ttlSeconds)),
      ]);
      return {
        url: remote.replace(/\/$/, ""),
        authorization: `Bearer ${token.plaintext}`,
      };
    },

    async token(name, scope, ttlSeconds) {
      using repo = await call(() => artifacts.get(name));
      const created = await call(() => repo.createToken(scope, ttlSeconds));
      return { token: created.plaintext, expiresAt: created.expiresAt };
    },

    async resolve(name, ref) {
      using repo = await call(() => artifacts.get(name));
      const [commit] = await call(() => repo.log({ ref, limit: 1 }));
      return commit ? { commit: commit.hash, tree: commit.treeHash } : null;
    },

    async mergeBase(name, onto, head) {
      using repo = await call(() => artifacts.get(name));
      const found = await mergeBase(
        async (ref, limit, offset) =>
          (await call(() => repo.log({ ref, limit, offset }))).map((c) => ({
            hash: c.hash,
            tree: c.treeHash,
            parents: c.parents,
          })),
        onto,
        head,
      );
      return found ? { commit: found.hash, tree: found.tree } : null;
    },

    async branchCommits(name, onto, head) {
      using repo = await call(() => artifacts.get(name));
      return await branchCommits(
        async (ref, limit, offset) =>
          (await call(() => repo.log({ ref, limit, offset }))).map(toCommit),
        onto,
        head,
      );
    },

    async readFiles(name, reads) {
      using repo = await call(() => artifacts.get(name));
      return await inBatches(reads, async (read) => {
        const blob = await call(() => repo.readFile(read));
        return blob ? fileVersion(blob) : null;
      });
    },

    async readShownFiles(name, reads) {
      using repo = await call(() => artifacts.get(name));
      return await inBatches(reads, async (read) => {
        const blob = await call(() => repo.readFile(read));
        return blob ? pathFile(read.path, blob) : null;
      });
    },

    async listFiles(name, ref) {
      using repo = await call(() => artifacts.get(name));
      const [commit] = await call(() => repo.log({ ref, limit: 1 }));
      if (!commit) {
        return null;
      }
      const listed = await walkFiles(treeReader(repo), commit.treeHash, {
        maxTrees: MAX_LISTED_TREES,
        concurrency: BLOB_READ_CONCURRENCY,
      });
      if (listed.truncated) {
        log.warning("file listing cut short", {
          artifactsName: name,
          files: listed.paths.length,
        });
      }
      return listed;
    },

    async readPath(name, ref, path) {
      using repo = await call(() => artifacts.get(name));
      const [commit] = await call(() => repo.log({ ref, limit: 1 }));
      if (!commit) {
        return null;
      }
      const target = await readPath(treeReader(repo), commit.treeHash, path);
      if (target?.kind !== "file") {
        return target;
      }
      const blob = await call(() => repo.readBlob(target.hash));
      return blob ? { kind: "file", file: await pathFile(path, blob) } : null;
    },

    // The binding has no ref listing, so this asks git itself: the ref
    // advertisement a clone starts with, read with a short-lived token.
    async branches(name) {
      using repo = await call(() => artifacts.get(name));
      const [{ remote }, token] = await Promise.all([
        call(() => repo.info()),
        call(() => repo.createToken("read", REFS_TOKEN_TTL_SECONDS)),
      ]);
      const response = await fetch(
        `${remote.replace(/\/$/, "")}/info/refs?service=git-upload-pack`,
        {
          headers: {
            authorization: `Bearer ${token.plaintext}`,
            "user-agent": "git/2.47.0 (iron-garden)",
          },
        },
      );
      if (!response.ok) {
        log.error("ref advertisement failed", {
          artifactsName: name,
          status: response.status,
        });
        throw new GitHostError(
          "FAILED",
          `Git storage refused to list branches (${response.status})`,
        );
      }
      return parseRefAdvertisement(
        new Uint8Array(await response.arrayBuffer()),
      );
    },

    async log(name, ref, { limit, offset }) {
      using repo = await call(() => artifacts.get(name));
      const commits = await call(() => repo.log({ ref, limit, offset }));
      return commits.map(toCommit);
    },

    async changedFiles(name, base, head) {
      using repo = await call(() => artifacts.get(name));
      const changes = await diffTrees(
        treeReader(repo),
        base?.tree ?? null,
        head.tree,
      );
      if (changes.length > MAX_CHANGED_FILES) {
        throw new GitHostError(
          "TOO_LARGE",
          `The change touches ${changes.length} files; at most ${MAX_CHANGED_FILES} are supported`,
        );
      }
      return await withLineCounts(changes, async (hash) => {
        const blob = await call(() => repo.readBlob(hash));
        return blob ? countLines(await blob.text()) : 0;
      });
    },
  };
}

function treeReader(repo: ArtifactsRepo) {
  return async (hash: string) => {
    const entries = await call(() => repo.readTree(hash));
    if (!entries) {
      throw new GitHostError("FAILED", `Git storage has no tree ${hash}`);
    }
    return entries;
  };
}

async function pathFile(path: string, blob: Blob): Promise<PathFile> {
  const type = imageTypeOf(path);
  if (!type || blob.size > MAX_SHOWN_FILE_BYTES) {
    return fileVersion(blob);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { kind: "image", type, base64: toBase64(bytes), bytes: blob.size };
}

function toCommit(c: ArtifactsCommitMetadata): Commit {
  return {
    hash: c.hash,
    message: c.message,
    author: c.author.name,
    committedAt: c.committedAt * 1000,
    parents: c.parents,
  };
}

async function fileVersion(blob: Blob): Promise<FileVersion> {
  if (blob.size > MAX_SHOWN_FILE_BYTES) {
    return { kind: "too-large", bytes: blob.size };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Git's own test: a NUL byte near the start means binary.
  if (bytes.subarray(0, 8000).includes(0)) {
    return { kind: "binary", bytes: blob.size };
  }
  return { kind: "text", text: new TextDecoder().decode(bytes) };
}

async function withLineCounts(
  changes: TreeChange[],
  linesOf: (hash: string) => Promise<number>,
): Promise<ChangedFile[]> {
  return inBatches(changes, async (change) => ({
    ...change,
    oldLines: change.oldHash ? await linesOf(change.oldHash) : 0,
    newLines: change.newHash ? await linesOf(change.newHash) : 0,
  }));
}

async function inBatches<T, R>(
  items: T[],
  each: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += BLOB_READ_CONCURRENCY) {
    const batch = items.slice(i, i + BLOB_READ_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(each))));
  }
  return results;
}

// Artifacts errors carry a string code; the ones a caller can act on get their
// own GitHostError, and every other failure is reported with the storage's
// message rather than as an unexplained 500.
async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    throw toGitHostError(err);
  }
}

function toGitHostError(err: unknown): GitHostError {
  const code = (err as { code?: unknown }).code;
  switch (code) {
    case "NOT_FOUND":
      return new GitHostError("NOT_FOUND", "The git repository does not exist");
    case "ALREADY_EXISTS":
      return new GitHostError("ALREADY_EXISTS", "The git repository exists");
    case "CREATE_IN_PROGRESS":
    case "FORK_IN_PROGRESS":
    case "IMPORT_IN_PROGRESS":
      return new GitHostError(
        "UNAVAILABLE",
        "The git repository is still being prepared; try again shortly",
      );
    case "MEMORY_LIMIT":
      return new GitHostError(
        "TOO_LARGE",
        "A file in the change is too large to read",
      );
  }
  const message = err instanceof Error ? err.message : String(err);
  log.error("git storage call failed", { code, err });
  return new GitHostError(
    "FAILED",
    `Git storage failed${typeof code === "string" ? ` (${code})` : ""}: ${message}`,
  );
}
