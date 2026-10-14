import type { TreeChange } from "./tree-diff";
import type { Branch } from "./refs";
import type { PathEntry } from "./tree-path";
import type { GitRemote } from "./mirror";

export type TokenScope = "read" | "write";

export interface GitToken {
  token: string;
  expiresAt: string;
}

export interface ResolvedRef {
  commit: string;
  tree: string;
}

export interface ChangedFile extends TreeChange {
  oldLines: number;
  newLines: number;
}

// A file at one commit, as a reviewer can be shown it.
export type FileVersion =
  | { kind: "text"; text: string }
  | { kind: "binary"; bytes: number }
  | { kind: "too-large"; bytes: number };

// A file as the code browser shows it: a raster image comes as its bytes.
export type PathFile =
  | FileVersion
  | { kind: "image"; type: string; base64: string; bytes: number };

// What a path names at a commit: a directory's entries, or a file.
export type PathContents =
  | { kind: "directory"; entries: PathEntry[] }
  | { kind: "file"; file: PathFile };

export interface Commit {
  hash: string;
  message: string;
  author: string;
  // Epoch milliseconds.
  committedAt: number;
  parents: string[];
}

// Everything the platform asks of git storage. Names are git-storage names
// (derived from ids), never the names people see.
export interface GitHost {
  create(
    name: string,
    options: { defaultBranch: string; description?: string },
  ): Promise<void>;
  delete(name: string): Promise<void>;
  fork(
    source: string,
    target: string,
    description?: string,
  ): Promise<{ remote: string; token: GitToken }>;
  remote(name: string): Promise<string>;
  // The repository as a smart HTTP remote with a token minted for it, for
  // moving refs and objects with the git protocol.
  gitRemote(
    name: string,
    scope: TokenScope,
    ttlSeconds: number,
  ): Promise<GitRemote>;
  token(name: string, scope: TokenScope, ttlSeconds: number): Promise<GitToken>;
  resolve(name: string, ref: string): Promise<ResolvedRef | null>;
  // Where head leaves onto's history: the newest commit on onto's
  // first-parent line that head contains. A branch is reviewed against this,
  // so one behind its target is not charged with the target's newer changes.
  mergeBase(
    name: string,
    onto: string,
    head: string,
  ): Promise<ResolvedRef | null>;
  // The commits head adds over onto's first-parent line, oldest first.
  branchCommits(
    name: string,
    onto: string | null,
    head: string,
  ): Promise<Commit[]>;
  // Each file at path in ref, or null when ref has no such file.
  readFiles(
    name: string,
    reads: { ref: string; path: string }[],
  ): Promise<(FileVersion | null)[]>;
  // Like readFiles, but as a person is shown them: a raster image comes as
  // its bytes rather than as binary.
  readShownFiles(
    name: string,
    reads: { ref: string; path: string }[],
  ): Promise<(PathFile | null)[]>;
  // Every file path at ref, sorted; null when ref does not resolve. A very
  // large tree is cut short and says so.
  listFiles(
    name: string,
    ref: string,
  ): Promise<{ paths: string[]; truncated: boolean } | null>;
  // What path names at ref, or null when ref or the path does not exist.
  readPath(
    name: string,
    ref: string,
    path: string,
  ): Promise<PathContents | null>;
  // The repository's branches by name, and the one HEAD points at.
  branches(name: string): Promise<{ head: string | null; branches: Branch[] }>;
  // Commits along ref's first-parent line, newest first; none when ref does
  // not resolve.
  log(
    name: string,
    ref: string,
    page: { limit: number; offset: number },
  ): Promise<Commit[]>;
  changedFiles(
    name: string,
    base: ResolvedRef | null,
    head: ResolvedRef,
  ): Promise<ChangedFile[]>;
}

export class GitHostError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "ALREADY_EXISTS"
      | "TOO_LARGE"
      | "UNAVAILABLE"
      | "FAILED",
    message: string,
  ) {
    super(message);
    this.name = "GitHostError";
  }
}
