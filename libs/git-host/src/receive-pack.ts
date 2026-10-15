import { lineText, PktReader } from "./pkt-line";

const ZERO = /^0+$/;

export interface PushedBranch {
  branch: string;
  deleted: boolean;
}

// The branches a git-receive-pack request updates: the commands in front of
// its pack, each "<old> <new> <ref>", the first with capabilities after a
// NUL. Only reads up to the flush that ends them.
export async function pushedBranches(
  body: ReadableStream<Uint8Array>,
): Promise<PushedBranch[]> {
  const reader = new PktReader(body.getReader());
  const branches: PushedBranch[] = [];
  try {
    for (let line = await reader.read(); line; line = await reader.read()) {
      if (line === "flush") {
        break;
      }
      const branch = branchOf(lineText(line));
      if (branch) {
        branches.push(branch);
      }
    }
  } finally {
    await reader.cancel();
  }
  return branches;
}

function branchOf(command: string): PushedBranch | null {
  const [, next, ref] = command.split("\0")[0]!.split(" ");
  if (!next || !ref?.startsWith("refs/heads/")) {
    return null;
  }
  return {
    branch: ref.slice("refs/heads/".length),
    deleted: ZERO.test(next),
  };
}
