import { moduleLogger } from "@lib/logging";
import { FLUSH, PktReader, concat, lineText, pktLine } from "./pkt-line";
import { BRANCH_PREFIX, parseAdvertisement, type Advertisement } from "./refs";

const log = moduleLogger("git-host/mirror");

const ZERO = "0".repeat(40);
const USER_AGENT = "git/2.47.0 (iron-garden)";
// Enough of the target's tips for the source to leave out what it already has.
const MAX_HAVES = 256;

// A git smart HTTP remote: its URL (ending in .git or the storage's own
// form) and the Authorization header it takes.
export interface GitRemote {
  url: string;
  authorization: string;
}

// One branch moved on the target: null `from` creates it, null `to` deletes it.
export interface BranchUpdate {
  branch: string;
  from: string | null;
  to: string | null;
}

// The same for any ref, by its full name.
export interface RefUpdate {
  ref: string;
  from: string | null;
  to: string | null;
}

// Each side's refs by full name, for planning what to move.
export type RefPlan = (
  source: Map<string, string>,
  target: Map<string, string>,
) => RefUpdate[];

export class MirrorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MirrorError";
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// Makes the target's branches match the source's, copying only the objects the
// target lacks. Without `only`, every source branch is created or moved and
// none is deleted; with it, just those branches move, and one the source no
// longer has is deleted from the target. The source always wins: a branch
// that diverged on the target is overwritten.
export async function mirrorBranches(
  source: GitRemote,
  target: GitRemote,
  options: { only?: string[] } = {},
  fetcher: Fetch = fetch,
): Promise<BranchUpdate[]> {
  const updates = await transferRefs(
    source,
    target,
    (from, to) =>
      planUpdates(from, to, options.only).map((u) => ({
        ref: BRANCH_PREFIX + u.branch,
        from: u.from,
        to: u.to,
      })),
    fetcher,
  );
  return updates.map((u) => ({
    branch: u.ref.slice(BRANCH_PREFIX.length),
    from: u.from,
    to: u.to,
  }));
}

// Moves the target's refs as `plan` says, copying from the source only the
// objects the target lacks. The plan sees both sides' refs as they are now;
// a target ref that moves meanwhile is refused rather than overwritten.
export async function transferRefs(
  source: GitRemote,
  target: GitRemote,
  plan: RefPlan,
  fetcher: Fetch = fetch,
): Promise<RefUpdate[]> {
  const [from, to] = await Promise.all([
    advertise(source, "git-upload-pack", fetcher),
    advertise(target, "git-receive-pack", fetcher),
  ]);
  const updates = plan(from.refs, to.refs);
  if (updates.length === 0) {
    log.info("refs already match", { host: hostOf(target.url) });
    return [];
  }
  const wants = [...new Set(updates.flatMap((u) => (u.to ? [u.to] : [])))];
  const pack = wants.length
    ? await requestPack(source, from, to, wants, fetcher)
    : null;
  await pushUpdates(target, to, updates, pack, fetcher);
  log.info("refs transferred", {
    host: hostOf(target.url),
    created: updates.filter((u) => !u.from).length,
    moved: updates.filter((u) => u.from && u.to).length,
    deleted: updates.filter((u) => !u.to).length,
  });
  return updates;
}

// Moves the target's refs to objects the caller built, sent as one pack.
export async function pushPack(
  target: GitRemote,
  updates: RefUpdate[],
  pack: Uint8Array,
  fetcher: Fetch = fetch,
): Promise<void> {
  const advertised = await advertise(target, "git-receive-pack", fetcher);
  await pushUpdates(
    target,
    advertised,
    updates,
    { chunks: [pack], cancel: async () => undefined },
    fetcher,
  );
  log.info("pack pushed", { host: hostOf(target.url), refs: updates.length });
}

// Deletes refs on the target wherever they point now; ones it lacks are
// skipped. Returns the refs it deleted.
export async function deleteRefs(
  target: GitRemote,
  refs: string[],
  fetcher: Fetch = fetch,
): Promise<string[]> {
  const advertised = await advertise(target, "git-receive-pack", fetcher);
  const updates = refs.flatMap((ref) => {
    const from = advertised.refs.get(ref);
    return from ? [{ ref, from, to: null }] : [];
  });
  if (updates.length > 0) {
    await pushUpdates(target, advertised, updates, null, fetcher);
  }
  log.info("refs deleted", { host: hostOf(target.url), refs: updates.length });
  return updates.map((u) => u.ref);
}

// The refs a remote has now, by full name.
export async function listRefs(
  remote: GitRemote,
  fetcher: Fetch = fetch,
): Promise<Map<string, string>> {
  return (await advertise(remote, "git-upload-pack", fetcher)).refs;
}

export function planUpdates(
  source: Map<string, string>,
  target: Map<string, string>,
  only?: string[],
): BranchUpdate[] {
  const names = only ?? branchNames(source);
  const updates: BranchUpdate[] = [];
  for (const branch of names) {
    const ref = BRANCH_PREFIX + branch;
    const to = source.get(ref) ?? null;
    const from = target.get(ref) ?? null;
    if (to !== from && (to || only)) {
      updates.push({ branch, from, to });
    }
  }
  return updates;
}

async function advertise(
  remote: GitRemote,
  service: "git-upload-pack" | "git-receive-pack",
  fetcher: Fetch,
): Promise<Advertisement> {
  const response = await fetcher(`${remote.url}/info/refs?service=${service}`, {
    headers: headers(remote),
  });
  if (!response.ok) {
    log.warning("ref advertisement refused", {
      host: hostOf(remote.url),
      service,
      status: response.status,
    });
    throw new MirrorError(
      `${hostOf(remote.url)} refused to list refs (${response.status})`,
    );
  }
  return parseAdvertisement(new Uint8Array(await response.arrayBuffer()));
}

// Asks the source for a pack holding the wanted commits, leaving out what the
// target's branches already reach. The pack comes back as a stream.
async function requestPack(
  source: GitRemote,
  offered: Advertisement,
  target: Advertisement,
  wants: string[],
  fetcher: Fetch,
): Promise<PackStream> {
  const capabilities = pick(offered.capabilities, [
    "side-band-64k",
    "no-progress",
    // The target must take the deltas the source sends.
    ...(target.capabilities.has("ofs-delta") ? ["ofs-delta"] : []),
  ]);
  const haves = [...new Set(target.refs.values())].slice(0, MAX_HAVES);
  const body = concat([
    ...wants.map((want, i) =>
      pktLine(
        i === 0
          ? `want ${want} ${[...capabilities, `agent=${USER_AGENT}`].join(" ")}\n`
          : `want ${want}\n`,
      ),
    ),
    FLUSH,
    ...haves.map((have) => pktLine(`have ${have}\n`)),
    pktLine("done\n"),
  ]);
  const response = await fetcher(`${source.url}/git-upload-pack`, {
    method: "POST",
    headers: {
      ...headers(source),
      "content-type": "application/x-git-upload-pack-request",
      accept: "application/x-git-upload-pack-result",
    },
    body,
  });
  if (!response.ok || !response.body) {
    log.warning("pack request refused", {
      host: hostOf(source.url),
      status: response.status,
    });
    throw new MirrorError(
      `${hostOf(source.url)} refused to send objects (${response.status})`,
    );
  }
  const reader = new PktReader(response.body.getReader());
  await readAcknowledgement(reader);
  return capabilities.includes("side-band-64k")
    ? { chunks: sideBandData(reader), cancel: () => reader.cancel() }
    : { chunks: reader.rest(), cancel: () => reader.cancel() };
}

interface PackStream {
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  cancel: () => Promise<void>;
}

// Without multi_ack the server answers a request ending in `done` with one
// NAK, or one ACK for the first common commit, before the pack.
async function readAcknowledgement(reader: PktReader): Promise<void> {
  for (;;) {
    const packet = await reader.read();
    if (packet === null) {
      throw new MirrorError("The source ended before sending objects");
    }
    if (packet === "flush") {
      continue;
    }
    const line = lineText(packet);
    if (line.startsWith("ERR ")) {
      throw new MirrorError(`The source refused: ${line.slice(4)}`);
    }
    if (line === "NAK" || line.startsWith("ACK ")) {
      return;
    }
  }
}

// Band 1 of a side-band stream is the pack, band 2 progress, band 3 an error.
async function* sideBandData(reader: PktReader): AsyncGenerator<Uint8Array> {
  for (;;) {
    const packet = await reader.read();
    if (packet === null || packet === "flush") {
      return;
    }
    const band = packet[0];
    if (band === 1) {
      yield packet.subarray(1);
    } else if (band === 3) {
      throw new MirrorError(
        `The source failed: ${lineText(packet.subarray(1))}`,
      );
    }
  }
}

// Sends the ref updates and the pack to the target's receive-pack as one
// streamed request, then checks every update was taken.
async function pushUpdates(
  target: GitRemote,
  advertised: Advertisement,
  updates: RefUpdate[],
  pack: PackStream | null,
  fetcher: Fetch,
): Promise<void> {
  const capabilities = pick(advertised.capabilities, [
    "report-status",
    "side-band-64k",
    "delete-refs",
  ]);
  if (updates.some((u) => !u.to) && !capabilities.includes("delete-refs")) {
    throw new MirrorError("The target does not allow deleting refs");
  }
  const response = await sendPush(
    target,
    updateCommands(updates, capabilities),
    pack,
    fetcher,
  );
  if (capabilities.includes("report-status")) {
    await checkReport(
      new PktReader(response.body!.getReader()),
      capabilities.includes("side-band-64k"),
    );
  } else {
    await response.body?.cancel();
  }
}

function updateCommands(
  updates: RefUpdate[],
  capabilities: string[],
): Uint8Array {
  return concat([
    ...updates.map((u, i) => {
      const line = `${u.from ?? ZERO} ${u.to ?? ZERO} ${u.ref}`;
      return pktLine(
        i === 0
          ? `${line}\0${[...capabilities, `agent=${USER_AGENT}`].join(" ")}\n`
          : `${line}\n`,
      );
    }),
    FLUSH,
  ]);
}

// The commands then the pack, streamed as they arrive from the source.
async function sendPush(
  target: GitRemote,
  commands: Uint8Array,
  pack: PackStream | null,
  fetcher: Fetch,
): Promise<Response> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writing = writeBody(writable, commands, pack);
  let response: Response;
  try {
    response = await fetcher(`${target.url}/git-receive-pack`, {
      method: "POST",
      headers: {
        ...headers(target),
        "content-type": "application/x-git-receive-pack-request",
        accept: "application/x-git-receive-pack-result",
      },
      body: readable,
      // Node's fetch needs it for a streamed body; workerd ignores it.
      duplex: "half",
    } as RequestInit);
  } catch (err) {
    await pack?.cancel();
    throw err;
  }
  if (!response.ok || !response.body) {
    await pack?.cancel();
    log.warning("push refused", {
      host: hostOf(target.url),
      status: response.status,
    });
    throw new MirrorError(
      `${hostOf(target.url)} refused the push (${response.status})`,
    );
  }
  await writing;
  return response;
}

async function writeBody(
  writable: WritableStream<Uint8Array>,
  commands: Uint8Array,
  pack: PackStream | null,
): Promise<void> {
  const writer = writable.getWriter();
  try {
    await writer.write(commands);
    for await (const chunk of pack?.chunks ?? []) {
      await writer.write(chunk);
    }
    await writer.close();
  } catch (err) {
    await writer.abort(err).catch(() => undefined);
    throw err;
  }
}

// report-status: `unpack ok`, then `ok <ref>` or `ng <ref> <reason>` per
// update, carried in band 1 when side-band is on.
async function checkReport(
  reader: PktReader,
  sideBand: boolean,
): Promise<void> {
  const lines = sideBand
    ? await reportLines(new PktReader(streamOf(sideBandData(reader))))
    : await reportLines(reader);
  const failures = lines.filter(
    (line) =>
      (line.startsWith("unpack ") && line !== "unpack ok") ||
      line.startsWith("ng "),
  );
  if (failures.length) {
    log.warning("push rejected", { failures });
    throw new MirrorError(
      `The target rejected the push: ${failures.join("; ")}`,
    );
  }
}

async function reportLines(reader: PktReader): Promise<string[]> {
  const lines: string[] = [];
  for (;;) {
    const packet = await reader.read();
    if (packet === null || packet === "flush") {
      return lines;
    }
    lines.push(lineText(packet));
  }
}

function streamOf(chunks: AsyncIterable<Uint8Array>) {
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  }).getReader();
}

function branchNames(refs: Map<string, string>): string[] {
  return [...refs.keys()]
    .filter((ref) => ref.startsWith(BRANCH_PREFIX))
    .map((ref) => ref.slice(BRANCH_PREFIX.length));
}

function pick(offered: Set<string>, wanted: string[]): string[] {
  return wanted.filter((capability) => offered.has(capability));
}

function headers(remote: GitRemote): Record<string, string> {
  return { authorization: remote.authorization, "user-agent": USER_AGENT };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "The git server";
  }
}
