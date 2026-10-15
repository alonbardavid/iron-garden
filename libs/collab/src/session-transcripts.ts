import {
  agentSessions,
  and,
  desc,
  eq,
  getDb,
  sql,
  transcripts,
  type TranscriptEntryRow,
  type TranscriptSource,
} from "@lib/db-models";
import { authorize, ForgeError } from "@lib/forge";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("collab/session-transcripts");

export interface SessionTranscriptSummary {
  id: string;
  commit: string | null;
  source: TranscriptSource;
  entries: number;
  createdAt: number;
  updatedAt: number | null;
}

export interface SessionTranscript extends Omit<
  SessionTranscriptSummary,
  "entries"
> {
  entries: TranscriptEntryRow[];
}

// A session's transcripts, newest first. The entries are counted in the
// database: a transcript can be most of a megabyte.
export async function transcriptSummariesOf(
  sessionId: string,
): Promise<SessionTranscriptSummary[]> {
  const rows = await getDb()
    .select({
      id: transcripts.id,
      commit: transcripts.commitSha,
      source: transcripts.source,
      entries: sql<number>`json_array_length(${transcripts.entries})`,
      createdAt: transcripts.createdAt,
      updatedAt: transcripts.updatedAt,
    })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(desc(transcripts.createdAt));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt?.getTime() ?? null,
  }));
}

// One of a session's transcripts, for anyone who can read its repository.
export async function getSessionTranscript(
  principal: Principal,
  repositoryName: string,
  sessionId: string,
  transcriptId: string,
): Promise<SessionTranscript> {
  const repository = await authorize(principal, repositoryName, "read");
  const [found] = await getDb()
    .select({ transcript: transcripts })
    .from(transcripts)
    .innerJoin(agentSessions, eq(agentSessions.id, transcripts.sessionId))
    .where(
      and(
        eq(transcripts.id, transcriptId),
        eq(transcripts.sessionId, sessionId),
        eq(agentSessions.repositoryId, repository.id),
      ),
    );
  if (!found) {
    throw new ForgeError("NOT_FOUND", "Transcript not found");
  }
  const { transcript } = found;
  log.info("session transcript read", {
    sessionId,
    transcriptId,
    entries: transcript.entries.length,
  });
  return {
    id: transcript.id,
    commit: transcript.commitSha,
    source: transcript.source,
    entries: transcript.entries,
    createdAt: transcript.createdAt.getTime(),
    updatedAt: transcript.updatedAt?.getTime() ?? null,
  };
}
