export interface Branch {
  name: string;
  commit: string;
}

export interface Advertisement {
  // Every ref the server listed, by full name.
  refs: Map<string, string>;
  capabilities: Set<string>;
  // The branch HEAD points at, when the server says.
  head: string | null;
}

export const BRANCH_PREFIX = "refs/heads/";

// The branches in a git smart HTTP ref advertisement (the body of
// `info/refs?service=git-upload-pack`), sorted by name, and the branch HEAD
// points at when the server says.
export function parseRefAdvertisement(body: Uint8Array): {
  head: string | null;
  branches: Branch[];
} {
  const { refs, head } = parseAdvertisement(body);
  return { head, branches: branchesOf(refs) };
}

// Everything a ref advertisement says: the refs, and on the first ref line
// (after a NUL) the server's capabilities.
export function parseAdvertisement(body: Uint8Array): Advertisement {
  const refs = new Map<string, string>();
  const capabilities = new Set<string>();
  let head: string | null = null;
  for (const line of pktLines(body)) {
    const [ref, offered] = line.split("\0");
    const [commit, name] = ref!.split(" ");
    for (const capability of offered?.split(" ") ?? []) {
      if (capability) {
        capabilities.add(capability);
      }
    }
    const symref = /(?:^| )symref=HEAD:(\S+)/.exec(offered ?? "")?.[1];
    if (symref?.startsWith(BRANCH_PREFIX)) {
      head = symref.slice(BRANCH_PREFIX.length);
    }
    if (commit && /^[0-9a-f]{40}$/.test(commit) && name?.startsWith("refs/")) {
      refs.set(name, commit);
    }
  }
  return { refs, capabilities, head };
}

export function branchesOf(refs: Map<string, string>): Branch[] {
  const branches: Branch[] = [];
  for (const [name, commit] of refs) {
    if (name.startsWith(BRANCH_PREFIX)) {
      branches.push({ name: name.slice(BRANCH_PREFIX.length), commit });
    }
  }
  return branches.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
}

// Each pkt-line's payload without its newline. A flush packet carries none.
function pktLines(body: Uint8Array): string[] {
  const decoder = new TextDecoder();
  const lines: string[] = [];
  let at = 0;
  while (at + 4 <= body.length) {
    const length = parseInt(decoder.decode(body.subarray(at, at + 4)), 16);
    if (Number.isNaN(length)) {
      break;
    }
    if (length < 4) {
      at += 4;
      continue;
    }
    const payload = decoder.decode(body.subarray(at + 4, at + length));
    lines.push(payload.replace(/\n$/, ""));
    at += length;
  }
  return lines;
}
