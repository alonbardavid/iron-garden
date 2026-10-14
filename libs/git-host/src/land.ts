import { moduleLogger } from "@lib/logging";
import { pushPack, type GitRemote } from "./mirror";
import { commitObject, packOf, type Signature } from "./objects";
import { BRANCH_PREFIX } from "./refs";

const log = moduleLogger("git-host/land");

export const MERGE_METHODS = ["merge", "squash", "rebase"] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

export interface Landing {
  branch: string;
  // The branch's tip now, which head must contain; null for a branch that
  // does not exist yet.
  expected: string | null;
  head: { commit: string; tree: string };
  method: MergeMethod;
  message: string;
  author: Signature;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// Lands a change on a branch of a remote that already holds head's commits,
// the way GitHub's merge button does: a merge commit, one squashed commit, or
// head's own commits. Head must already contain the branch's tip, so every
// method keeps head's tree and needs no content merge; rebasing is then a
// fast-forward. The push is refused if the branch moved since `expected`.
export async function landBranch(
  target: GitRemote,
  landing: Landing,
  fetcher: Fetch = fetch,
): Promise<string> {
  const commit = await landedCommit(landing);
  await pushPack(
    target,
    [
      {
        ref: BRANCH_PREFIX + landing.branch,
        from: landing.expected,
        to: commit?.sha ?? landing.head.commit,
      },
    ],
    await packOf(commit ? [commit] : []),
    fetcher,
  );
  const tip = commit?.sha ?? landing.head.commit;
  log.info("branch landed", { method: landing.method, commit: tip });
  return tip;
}

// The commit the method writes, or null when the branch just moves to head.
async function landedCommit(landing: Landing) {
  const { expected, head, method } = landing;
  if (method === "rebase" || expected === null) {
    return null;
  }
  return commitObject({
    tree: head.tree,
    parents: method === "merge" ? [expected, head.commit] : [expected],
    author: landing.author,
    committer: landing.author,
    message: landing.message,
  });
}
