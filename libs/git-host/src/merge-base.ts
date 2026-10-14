export interface LogCommit {
  hash: string;
  tree: string;
  parents: string[];
}

// A page of a ref's first-parent history, newest first.
export type ReadLog = (
  ref: string,
  limit: number,
  offset: number,
) => Promise<LogCommit[]>;

// Each page is one storage read: onto's history is read once, as deep as a
// target branch plausibly moves under a branch; head's side reads at most
// MAX_HEAD_PAGES pages across its own line and the branches merged into it.
const ONTO_DEPTH = 1000;
const HEAD_PAGE = 100;
const MAX_HEAD_PAGES = 20;

// The newest commit on onto's first-parent line that head contains, or null
// when none is within reach. Walks head's first-parent line and the other
// parents of each merge on it, so a branch that merged its target in is
// measured from that merge.
export async function mergeBase(
  readLog: ReadLog,
  onto: string,
  head: string,
): Promise<LogCommit | null> {
  const ontoLine = await readLog(onto, ONTO_DEPTH, 0);
  if (ontoLine.length === 0) {
    return null;
  }
  const depth = new Map(ontoLine.map((commit, i) => [commit.hash, i]));
  let best = Infinity;
  const seen = new Set<string>();
  const tips: string[] = [];
  let pages = 0;

  const reach = (hash: string) => {
    const at = depth.get(hash);
    if (at !== undefined) {
      best = Math.min(best, at);
    } else if (!seen.has(hash)) {
      tips.push(hash);
    }
  };

  // Reads tip's first-parent line until it meets onto's line or a commit
  // already walked. False once the page budget runs out.
  const walk = async (tip: string): Promise<boolean> => {
    for (let offset = 0; ; offset += HEAD_PAGE) {
      if (++pages > MAX_HEAD_PAGES) {
        return false;
      }
      const page = await readLog(tip, HEAD_PAGE, offset);
      for (const commit of page) {
        const at = depth.get(commit.hash);
        if (at !== undefined) {
          best = Math.min(best, at);
          return true;
        }
        if (seen.has(commit.hash)) {
          return true;
        }
        seen.add(commit.hash);
        commit.parents.slice(1).forEach(reach);
      }
      if (page.length < HEAD_PAGE) {
        return true;
      }
    }
  };

  reach(head);
  while (tips.length > 0 && best > 0) {
    const tip = tips.pop()!;
    if (!seen.has(tip) && !(await walk(tip))) {
      return null;
    }
  }
  return ontoLine[best] ?? null;
}
