import {
  agents,
  and,
  eq,
  getDb,
  inArray,
  isNull,
  newEntityId,
  or,
  pullRequestComments,
  pullRequestFiles,
  type CommentKind,
  type CommentStatus,
} from "@lib/db-models";
import { ForgeError } from "@lib/forge";
import { getUserProfiles, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { rangeProblems } from "./groups";
import { pullRequestByNumber, type PullRequestRow } from "./lookup";

const log = moduleLogger("review/comments");

export type CommentAuthor =
  | { kind: "user"; id: string; name: string }
  | { kind: "agent"; id: string; name: string; ownerName: string | null };

export interface Comment {
  id: string;
  parent: string | null;
  author: CommentAuthor | null;
  mine: boolean;
  kind: CommentKind | null;
  path: string | null;
  start: number | null;
  end: number | null;
  body: string;
  revision: number;
  headCommit: string;
  status: CommentStatus;
  review: string | null;
  resolved: {
    by: { id: string; name: string } | null;
    at: number;
    commit: string;
  } | null;
  sentAt: number | null;
  createdAt: number;
}

export interface CommentInput {
  parent?: string;
  kind?: CommentKind;
  path?: string;
  start?: number;
  end?: number;
  body: string;
  send?: boolean;
}

type CommentRow = typeof pullRequestComments.$inferSelect;

// Every comment that went out on the pull request, and the principal's own
// drafts.
export async function listComments(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<Comment[]> {
  const { row } = await pullRequestByNumber(principal, repositoryName, number);
  const rows = await getDb()
    .select()
    .from(pullRequestComments)
    .where(
      and(
        eq(pullRequestComments.pullRequestId, row.id),
        or(
          eq(pullRequestComments.status, "sent"),
          and(
            eq(pullRequestComments.authorUserId, principal.userId),
            authoredAs(principal),
          ),
        ),
      ),
    )
    .orderBy(pullRequestComments.createdAt);
  return present(principal, rows);
}

// A comment on lines or a reply. People's comments, flags and accepts wait
// for their review unless sent now; asks, replies and agents' comments go
// out at once. Agents comment and reply, but never flag or accept.
export async function createComment(
  principal: Principal,
  repositoryName: string,
  number: number,
  input: CommentInput,
): Promise<Comment> {
  const { row: pr } = await pullRequestByNumber(
    principal,
    repositoryName,
    number,
  );
  const placed = input.parent
    ? await replyPlacement(principal, pr, input.parent)
    : await rootPlacement(principal, pr, input);
  const status: CommentStatus =
    principal.kind === "agent" ||
    input.parent ||
    input.kind === "ask" ||
    input.send
      ? "sent"
      : "draft";
  const [row] = await getDb()
    .insert(pullRequestComments)
    .values({
      id: newEntityId("PULL_REQUEST_COMMENT"),
      pullRequestId: pr.id,
      ...placed,
      authorUserId: principal.userId,
      agentId: principal.kind === "agent" ? principal.agentId : null,
      body: input.body,
      revision: pr.revision,
      headCommit: pr.headCommit,
      status,
      sentAt: status === "sent" ? new Date() : null,
    })
    .returning();
  log.info("comment created", {
    pullRequestId: pr.id,
    commentId: row!.id,
    kind: row!.kind,
    status,
    reply: !!input.parent,
    byAgent: principal.kind === "agent",
  });
  return (await present(principal, [row!]))[0]!;
}

// Sends one of the principal's drafts ahead of their review.
export async function sendComment(
  principal: Principal,
  repositoryName: string,
  number: number,
  commentId: string,
): Promise<Comment> {
  const { comment } = await ownComment(
    principal,
    repositoryName,
    number,
    commentId,
  );
  if (comment.status === "sent") {
    return (await present(principal, [comment]))[0]!;
  }
  const [row] = await getDb()
    .update(pullRequestComments)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(pullRequestComments.id, comment.id))
    .returning();
  log.info("comment sent", { commentId: comment.id });
  return (await present(principal, [row!]))[0]!;
}

// A flag holds the pull request until the person who set it resolves it.
export async function resolveComment(
  principal: Principal,
  repositoryName: string,
  number: number,
  commentId: string,
  resolved: boolean,
): Promise<Comment> {
  const { pr, comment } = await ownComment(
    principal,
    repositoryName,
    number,
    commentId,
  );
  if (comment.kind !== "flag" || comment.status !== "sent") {
    throw new ForgeError(
      "BAD_REQUEST",
      "Only a flag that went out can be resolved",
    );
  }
  const [row] = await getDb()
    .update(pullRequestComments)
    .set(
      resolved
        ? {
            resolvedAt: new Date(),
            resolvedByUserId: principal.userId,
            resolvedCommit: pr.headCommit,
          }
        : { resolvedAt: null, resolvedByUserId: null, resolvedCommit: null },
    )
    .where(eq(pullRequestComments.id, comment.id))
    .returning();
  log.info(resolved ? "flag resolved" : "flag reopened", {
    commentId: comment.id,
  });
  return (await present(principal, [row!]))[0]!;
}

export async function deleteComment(
  principal: Principal,
  repositoryName: string,
  number: number,
  commentId: string,
): Promise<void> {
  const { comment } = await ownComment(
    principal,
    repositoryName,
    number,
    commentId,
  );
  await getDb()
    .delete(pullRequestComments)
    .where(eq(pullRequestComments.id, comment.id));
  log.info("comment deleted", { commentId: comment.id });
}

// How many of this person's drafts went out with their review.
export async function sendDrafts(
  pullRequestId: string,
  userId: string,
  reviewId: string,
): Promise<number> {
  const sent = await getDb()
    .update(pullRequestComments)
    .set({ status: "sent", sentAt: new Date(), reviewId })
    .where(
      and(
        eq(pullRequestComments.pullRequestId, pullRequestId),
        eq(pullRequestComments.authorUserId, userId),
        eq(pullRequestComments.status, "draft"),
      ),
    )
    .returning({ id: pullRequestComments.id });
  return sent.length;
}

async function rootPlacement(
  principal: Principal,
  pr: PullRequestRow,
  input: CommentInput,
) {
  const { kind, path, start, end } = input;
  if (!kind || !path || start === undefined || end === undefined) {
    throw new ForgeError(
      "BAD_REQUEST",
      "A comment on lines needs kind, path, start and end; a reply needs parent",
    );
  }
  if (principal.kind === "agent" && kind !== "comment") {
    throw new ForgeError(
      "FORBIDDEN",
      "Agents comment; only people flag, accept or ask",
    );
  }
  const files = await getDb()
    .select()
    .from(pullRequestFiles)
    .where(eq(pullRequestFiles.pullRequestId, pr.id));
  const problems = rangeProblems(
    new Map(files.map((f) => [f.path, f])),
    { path, start, end },
    "comment",
  );
  if (problems.length > 0) {
    throw new ForgeError("BAD_REQUEST", problems.join("\n"));
  }
  return { parentId: null, kind, path, start, end };
}

// A reply joins a thread that went out; replies have no replies of their own.
async function replyPlacement(
  principal: Principal,
  pr: PullRequestRow,
  parentId: string,
) {
  const [parent] = await getDb()
    .select()
    .from(pullRequestComments)
    .where(
      and(
        eq(pullRequestComments.id, parentId),
        eq(pullRequestComments.pullRequestId, pr.id),
      ),
    );
  if (!parent || (parent.status === "draft" && !isMine(principal, parent))) {
    throw new ForgeError("NOT_FOUND", "Comment not found");
  }
  if (parent.parentId || parent.status === "draft") {
    throw new ForgeError(
      "BAD_REQUEST",
      parent.parentId
        ? "Reply to the comment that starts the thread"
        : "Send the comment before replying to it",
    );
  }
  return {
    parentId: parent.id,
    kind: null,
    path: null,
    start: null,
    end: null,
  };
}

async function ownComment(
  principal: Principal,
  repositoryName: string,
  number: number,
  commentId: string,
): Promise<{ pr: PullRequestRow; comment: CommentRow }> {
  const { row: pr } = await pullRequestByNumber(
    principal,
    repositoryName,
    number,
  );
  const [comment] = await getDb()
    .select()
    .from(pullRequestComments)
    .where(
      and(
        eq(pullRequestComments.id, commentId),
        eq(pullRequestComments.pullRequestId, pr.id),
      ),
    );
  if (!comment || (comment.status === "draft" && !isMine(principal, comment))) {
    throw new ForgeError("NOT_FOUND", "Comment not found");
  }
  if (!isMine(principal, comment)) {
    throw new ForgeError("FORBIDDEN", "Only its author can change a comment");
  }
  return { pr, comment };
}

const authoredAs = (principal: Principal) =>
  principal.kind === "agent"
    ? eq(pullRequestComments.agentId, principal.agentId)
    : isNull(pullRequestComments.agentId);

function isMine(principal: Principal, row: CommentRow): boolean {
  return principal.kind === "agent"
    ? row.agentId === principal.agentId
    : row.authorUserId === principal.userId && row.agentId === null;
}

async function present(
  principal: Principal,
  rows: CommentRow[],
): Promise<Comment[]> {
  const agentIds = [...new Set(rows.flatMap((r) => r.agentId ?? []))];
  const agentRows = agentIds.length
    ? await getDb()
        .select({ id: agents.id, name: agents.name, owner: agents.ownerUserId })
        .from(agents)
        .where(inArray(agents.id, agentIds))
    : [];
  const people = await getUserProfiles([
    ...rows.flatMap((r) => r.authorUserId ?? []),
    ...rows.flatMap((r) => r.resolvedByUserId ?? []),
    ...agentRows.map((a) => a.owner),
  ]);
  const agentsBy = new Map(agentRows.map((a) => [a.id, a]));
  const personOf = (id: string | null) => {
    const profile = id ? people.get(id) : undefined;
    return profile ? { id: profile.id, name: profile.name } : null;
  };
  const authorOf = (row: CommentRow): CommentAuthor | null => {
    const agent = row.agentId ? agentsBy.get(row.agentId) : undefined;
    if (agent) {
      return {
        kind: "agent",
        id: agent.id,
        name: agent.name,
        ownerName: people.get(agent.owner)?.name ?? null,
      };
    }
    const person = row.agentId ? null : personOf(row.authorUserId);
    return person && { kind: "user", ...person };
  };
  return rows.map((row) => ({
    id: row.id,
    parent: row.parentId,
    author: authorOf(row),
    mine: isMine(principal, row),
    kind: row.kind,
    path: row.path,
    start: row.start,
    end: row.end,
    body: row.body,
    revision: row.revision,
    headCommit: row.headCommit,
    status: row.status,
    review: row.reviewId,
    resolved:
      row.resolvedAt && row.resolvedCommit
        ? {
            by: personOf(row.resolvedByUserId),
            at: row.resolvedAt.getTime(),
            commit: row.resolvedCommit,
          }
        : null,
    sentAt: row.sentAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
  }));
}
