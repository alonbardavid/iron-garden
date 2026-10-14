import {
  eq,
  getDb,
  newEntityId,
  pullRequestCommits,
  pullRequestReviews,
  type ReviewVerdict,
} from "@lib/db-models";
import { ForgeError } from "@lib/forge";
import { getUserProfiles, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { sendDrafts } from "./comments";
import { pullRequestByNumber } from "./lookup";
import { getPullRequest } from "./pull-requests";
import {
  summarizeTranscript,
  transcriptsOf,
  type TranscriptSummary,
} from "./transcripts";

const log = moduleLogger("review/activity");

export interface PullRequestCommit {
  sha: string;
  title: string;
  message: string;
  author: string;
  committedAt: number;
  transcript: TranscriptSummary | null;
}

export interface ReviewSession {
  id: string;
  author: { id: string; name: string } | null;
  verdict: ReviewVerdict;
  body: string | null;
  revision: number;
  accepted: number;
  total: number;
  createdAt: number;
}

export interface Activity {
  commits: PullRequestCommit[];
  reviews: ReviewSession[];
}

// What happened on a pull request besides its comments: the commits its
// branch adds, with their transcripts, the reviews people sent, and the
// lines each transcript produced.
export async function getActivity(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<Activity> {
  const { row } = await pullRequestByNumber(principal, repositoryName, number);
  const db = getDb();
  const [commits, attached, reviews] = await Promise.all([
    db
      .select()
      .from(pullRequestCommits)
      .where(eq(pullRequestCommits.pullRequestId, row.id))
      .orderBy(pullRequestCommits.position),
    transcriptsOf(row),
    db
      .select()
      .from(pullRequestReviews)
      .where(eq(pullRequestReviews.pullRequestId, row.id))
      .orderBy(pullRequestReviews.createdAt),
  ]);
  // The newest transcript of a commit wins when it has several.
  const byCommit = new Map(attached.map((t) => [t.commitSha, t]));
  return {
    commits: commits.map((commit) =>
      presentCommit(commit, byCommit.get(commit.sha)),
    ),
    reviews: await presentReviews(reviews),
  };
}

// A person's verdict, sent with every draft they wrote on the pull request
// and how far through it they are.
export async function submitReview(
  principal: Principal,
  repositoryName: string,
  number: number,
  input: { verdict: ReviewVerdict; body?: string | null },
): Promise<ReviewSession> {
  if (principal.kind !== "user") {
    throw new ForgeError("FORBIDDEN", "Only people review pull requests");
  }
  const pr = await getPullRequest(principal, repositoryName, number);
  const [row] = await getDb()
    .insert(pullRequestReviews)
    .values({
      id: newEntityId("PULL_REQUEST_REVIEW"),
      pullRequestId: pr.id,
      userId: principal.userId,
      verdict: input.verdict,
      body: input.body || null,
      revision: pr.revision,
      accepted: pr.review.accepted,
      total: pr.review.changes ?? 0,
    })
    .returning();
  const sent = await sendDrafts(pr.id, principal.userId, row!.id);
  log.info("review submitted", {
    pullRequestId: pr.id,
    reviewId: row!.id,
    verdict: input.verdict,
    comments: sent,
  });
  return (await presentReviews([row!]))[0]!;
}

function presentCommit(
  commit: typeof pullRequestCommits.$inferSelect,
  transcript: Awaited<ReturnType<typeof transcriptsOf>>[number] | undefined,
): PullRequestCommit {
  return {
    sha: commit.sha,
    title: commit.message.split("\n")[0]!,
    message: commit.message,
    author: commit.authorName,
    committedAt: commit.committedAt.getTime(),
    transcript: transcript ? summarizeTranscript(transcript) : null,
  };
}

async function presentReviews(
  rows: (typeof pullRequestReviews.$inferSelect)[],
): Promise<ReviewSession[]> {
  const people = await getUserProfiles(rows.flatMap((r) => r.userId ?? []));
  return rows.map((row) => {
    const person = row.userId ? people.get(row.userId) : undefined;
    return {
      id: row.id,
      author: person ? { id: person.id, name: person.name } : null,
      verdict: row.verdict,
      body: row.body,
      revision: row.revision,
      accepted: row.accepted,
      total: row.total,
      createdAt: row.createdAt.getTime(),
    };
  });
}
