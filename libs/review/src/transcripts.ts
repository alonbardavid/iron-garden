import { TRANSCRIPT_TRAILER } from "@lib/contract";
import {
  eq,
  getDb,
  inArray,
  newEntityId,
  pullRequestCommits,
  transcripts,
  type TranscriptEntryRow,
  type TranscriptSource,
} from "@lib/db-models";
import { activeSession, requireAgent, type Session } from "@lib/collab";
import { ForgeError } from "@lib/forge";
import { getGitHost, trailersOf, type Commit } from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { parseTranscript } from "./transcript-file";
import { pullRequestByNumber, type PullRequestRow } from "./lookup";

const log = moduleLogger("review/transcripts");

// A transcript is one row; D1 caps a row near 2 MB.
const MAX_TRANSCRIPT_BYTES = 1_500_000;
// Ids per query, under D1's 100 bound parameters.
const IN_LIST = 90;

export interface TranscriptSummary {
  id: string;
  commit: string | null;
  source: TranscriptSource;
  entries: number;
  createdAt: number;
}

export interface Transcript extends Omit<TranscriptSummary, "entries"> {
  entries: TranscriptEntryRow[];
}

type TranscriptRow = typeof transcripts.$inferSelect;

// An agent's transcript of its session. Naming the commit it led to attaches
// it now; without one, a commit attaches it by naming the transcript's id in
// its Agent-Transcript trailer.
export async function uploadTranscript(
  principal: Principal,
  sessionId: string,
  input: { commit?: string; entries: TranscriptEntryRow[] },
): Promise<TranscriptSummary> {
  const agent = requireAgent(principal);
  const session = await activeSession(agent, sessionId);
  assertFits(input.entries);
  const [row] = await getDb()
    .insert(transcripts)
    .values({
      id: newEntityId("TRANSCRIPT"),
      sessionId: session.id,
      commitSha: input.commit ?? null,
      source: input.commit ? "api" : "trailer",
      entries: input.entries,
    })
    .returning();
  log.info("transcript uploaded", {
    transcriptId: row!.id,
    sessionId: session.id,
    commit: input.commit ?? null,
    entries: input.entries.length,
  });
  return summarizeTranscript(row!);
}

// Attaches the transcripts the commits' trailers name: an id of one this
// session uploaded, or the path of a transcript file in the commit, which is
// read and stored. Returns the paths read that way, which are transcripts
// rather than code to review.
export async function attachTrailerTranscripts(
  session: Pick<Session, "id" | "artifactsName">,
  commits: Commit[],
): Promise<Set<string>> {
  const named = commits.flatMap((commit) => {
    const ref = transcriptRef(commit);
    return ref ? [{ commit: commit.hash, ref }] : [];
  });
  if (named.length === 0) {
    return new Set();
  }
  const db = getDb();
  const ids = new Set((await sessionTranscripts(session.id)).map((t) => t.id));
  const byId = named.filter((n) => ids.has(n.ref));
  const byPath = named.filter((n) => !ids.has(n.ref));
  await Promise.all(
    byId.map((n) =>
      db
        .update(transcripts)
        .set({ commitSha: n.commit, source: "trailer" })
        .where(eq(transcripts.id, n.ref)),
    ),
  );
  const read = await readTranscriptFiles(session, byPath);
  log.info("trailer transcripts attached", {
    sessionId: session.id,
    byId: byId.length,
    fromFiles: read.size,
    unreadable: byPath.length - read.size,
  });
  return new Set(byPath.filter((n) => read.has(n.commit)).map((n) => n.ref));
}

// The transcripts attached to a pull request's commits.
export async function transcriptsOf(
  pr: Pick<PullRequestRow, "id" | "sessionId">,
): Promise<TranscriptRow[]> {
  if (!pr.sessionId) {
    return [];
  }
  const [commits, all] = await Promise.all([
    getDb()
      .select({ sha: pullRequestCommits.sha })
      .from(pullRequestCommits)
      .where(eq(pullRequestCommits.pullRequestId, pr.id)),
    sessionTranscripts(pr.sessionId),
  ]);
  const shas = new Set(commits.map((c) => c.sha));
  const ids = all
    .filter((t) => t.commitSha && shas.has(t.commitSha))
    .map((t) => t.id);
  const rows = await Promise.all(
    chunks(ids, IN_LIST).map((some) =>
      getDb().select().from(transcripts).where(inArray(transcripts.id, some)),
    ),
  );
  return rows
    .flat()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

// A session's transcripts without their entries: a session has few, and
// commits can be more than one query may name.
async function sessionTranscripts(sessionId: string) {
  return getDb()
    .select({ id: transcripts.id, commitSha: transcripts.commitSha })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId));
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function getTranscript(
  principal: Principal,
  repositoryName: string,
  number: number,
  transcriptId: string,
): Promise<Transcript> {
  const { row } = await pullRequestByNumber(principal, repositoryName, number);
  const found = (await transcriptsOf(row)).find((t) => t.id === transcriptId);
  if (!found) {
    throw new ForgeError("NOT_FOUND", "Transcript not found");
  }
  return { ...summarizeTranscript(found), entries: found.entries };
}

// The Agent-Transcript trailer of a commit's message, if it has one.
export function transcriptRef(commit: Pick<Commit, "message">) {
  return trailersOf(commit.message).get(TRANSCRIPT_TRAILER.toLowerCase());
}

// Each named commit's transcript file, parsed and stored once; a file that
// is missing or not a transcript is skipped. Returns the commits read.
async function readTranscriptFiles(
  session: Pick<Session, "id" | "artifactsName">,
  named: { commit: string; ref: string }[],
): Promise<Set<string>> {
  if (named.length === 0) {
    return new Set();
  }
  const db = getDb();
  const stored = new Set(
    (await sessionTranscripts(session.id)).map((t) => t.commitSha),
  );
  const unread = named.filter((n) => !stored.has(n.commit));
  const versions = await getGitHost().readFiles(
    session.artifactsName,
    unread.map((n) => ({ ref: n.commit, path: n.ref })),
  );
  const read = new Set(
    named.filter((n) => stored.has(n.commit)).map((n) => n.commit),
  );
  for (const [i, n] of unread.entries()) {
    const version = versions[i];
    const entries =
      version?.kind === "text" ? parseTranscript(version.text) : null;
    if (!entries) {
      log.warn("transcript file unreadable", {
        sessionId: session.id,
        commit: n.commit,
        path: n.ref,
        kind: version?.kind ?? "missing",
      });
      continue;
    }
    await db.insert(transcripts).values({
      id: newEntityId("TRANSCRIPT"),
      sessionId: session.id,
      commitSha: n.commit,
      source: "trailer",
      entries,
    });
    read.add(n.commit);
  }
  return read;
}

function assertFits(entries: TranscriptEntryRow[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(entries)).length;
  if (bytes > MAX_TRANSCRIPT_BYTES) {
    throw new ForgeError(
      "BAD_REQUEST",
      `The transcript is ${bytes} bytes; at most ${MAX_TRANSCRIPT_BYTES} fit. Upload one per commit.`,
    );
  }
}

export function summarizeTranscript(row: TranscriptRow): TranscriptSummary {
  return {
    id: row.id,
    commit: row.commitSha,
    source: row.source,
    entries: row.entries.length,
    createdAt: row.createdAt.getTime(),
  };
}
