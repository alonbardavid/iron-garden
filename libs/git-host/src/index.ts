import { env } from "cloudflare:workers";
import { artifactsGitHost } from "./artifacts";
import type { GitHost } from "./host";

export { GitHostError } from "./host";
export type {
  GitHost,
  GitToken,
  TokenScope,
  ResolvedRef,
  ChangedFile,
  FileVersion,
  PathContents,
  PathFile,
  Commit,
} from "./host";
export type { Branch } from "./refs";
export type { PathEntry, PathEntryType } from "./tree-path";
export {
  diffTrees,
  countLines,
  type TreeEntry,
  type TreeChange,
} from "./tree-diff";
export { trailersOf, MAX_BRANCH_COMMITS } from "./commits";
export { proxyGit, gitServiceOf, type GitService } from "./proxy";

export {
  mirrorBranches,
  transferRefs,
  pushPack,
  deleteRefs,
  listRefs,
  MirrorError,
  type GitRemote,
  type BranchUpdate,
  type RefUpdate,
  type RefPlan,
} from "./mirror";
export { landBranch, MERGE_METHODS, type MergeMethod } from "./land";
export type { Signature } from "./objects";

let cached: GitHost | null = null;

// Callers ask getBindings().git first; this throws on a deployment without
// the Artifacts binding.
export function getGitHost(): GitHost {
  if (!cached) {
    const { ARTIFACTS } = env as { ARTIFACTS?: Artifacts };
    if (!ARTIFACTS) {
      throw new Error("Git hosting is not configured on this deployment");
    }
    cached = artifactsGitHost(ARTIFACTS);
  }
  return cached;
}
