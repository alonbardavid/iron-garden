import type { Commit } from "./host";

// A page of a ref's first-parent history, newest first.
export type ReadCommits = (
  ref: string,
  limit: number,
  offset: number,
) => Promise<Commit[]>;

// How far back onto's line is read, how many of head's commits one read
// takes, and the most commits a branch is listed with.
const ONTO_DEPTH = 1000;
const HEAD_PAGE = 100;
export const MAX_BRANCH_COMMITS = 250;

// The commits on head's first-parent line that onto's line does not have,
// oldest first: the branch's own work, with any merge of the target into it
// as one commit. Null onto (an empty repository) lists head's whole line.
// Only the newest MAX_BRANCH_COMMITS are listed.
export async function branchCommits(
  readCommits: ReadCommits,
  onto: string | null,
  head: string,
): Promise<Commit[]> {
  const ontoLine = onto
    ? new Set((await readCommits(onto, ONTO_DEPTH, 0)).map((c) => c.hash))
    : new Set<string>();
  const own: Commit[] = [];
  for (let offset = 0; own.length < MAX_BRANCH_COMMITS; offset += HEAD_PAGE) {
    const page = await readCommits(head, HEAD_PAGE, offset);
    for (const commit of page) {
      if (ontoLine.has(commit.hash) || own.length === MAX_BRANCH_COMMITS) {
        return own.reverse();
      }
      own.push(commit);
    }
    if (page.length < HEAD_PAGE) {
      break;
    }
  }
  return own.reverse();
}

// The value of each trailer in a commit message's last paragraph, by key
// (case-insensitive, as git compares them). A key given twice keeps its
// last value.
export function trailersOf(message: string): Map<string, string> {
  const paragraphs = message.trim().split(/\n\s*\n/);
  const trailers = new Map<string, string>();
  if (paragraphs.length < 2) {
    return trailers;
  }
  const lines = paragraphs[paragraphs.length - 1]!.split("\n");
  for (const line of lines) {
    const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\s*:\s*(.+?)\s*$/.exec(line);
    if (!match) {
      if (/^\s/.test(line)) {
        continue;
      }
      return new Map();
    }
    trailers.set(match[1]!.toLowerCase(), match[2]!);
  }
  return trailers;
}
