import {
  getDb,
  pullRequests,
  pullRequestFiles,
  pullRequestGroups,
  pullRequestRules,
  reviewMarks,
  pullRequestCommits,
  agents,
  newEntityId,
  and,
  eq,
  desc,
  inArray,
  sql,
  type PullRequestStatus,
  type FileChange,
  type Grouper,
  type PullRequestOrigin,
  type GithubPullState,
  type MergeMethod,
} from "@lib/db-models";
import { enqueueJob, groupsOnServer } from "@lib/ai";
import {
  activeSession,
  isClaude,
  requireAgent,
  type Session,
} from "@lib/collab";
import {
  authorize,
  authorizeId,
  ForgeError,
  requireGit,
  type AccessibleRepository,
} from "@lib/forge";
import {
  countLines,
  getGitHost,
  type ChangedFile,
  type Commit,
} from "@lib/git-host";
import { getUserProfiles, type Principal } from "@lib/identity";
import type { ChatEndpoints } from "@lib/contract";
import { moduleLogger } from "@lib/logging";
import {
  groupProblems,
  rangeProblems,
  referencePaths,
  type GroupInput,
  type GroupRange,
  type LineRange,
} from "./groups";
import { autoAcceptedCounts } from "./marks";
import { fillGroupingPrompt } from "./fill-prompt";
import { snapshotRules } from "./rules/rules";
import { authorOf, type PullRequestRow } from "./lookup";
import { openChannel, type ChatEndpointsFor } from "./chat/channels";
import { attachTrailerTranscripts, transcriptRef } from "./transcripts";

const log = moduleLogger("review/pull-requests");

export interface PullRequestLinks {
  url: string;
  submitUrl: string;
  refreshUrl: string;
  commentsUrl: string;
  chatUrl: string;
}

export interface PullRequestSummary {
  id: string;
  number: number;
  repository: string;
  title: string;
  status: PullRequestStatus;
  branch: string;
  targetBranch: string;
  revision: number;
  groupedBy: Grouper;
  origin: PullRequestOrigin;
  agent: { name: string; ownerName: string | null } | null;
  // Who opened one from GitHub.
  openedBy: string | null;
  fileCount: number;
  groupCount: number;
  // How far the principal is through reviewing it. changes is null until
  // someone opens the pull request and its files are diffed.
  review: { changes: number | null; accepted: number };
  createdAt: number;
  updatedAt: number;
}

export interface PullRequestFile {
  path: string;
  change: FileChange;
  oldLines: number;
  newLines: number;
}

export interface PullRequestGroup {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  ranges: GroupRange[];
}

export interface PullRequestDetail extends PullRequestSummary {
  description: string | null;
  baseCommit: string;
  headCommit: string;
  processingError: string | null;
  files: PullRequestFile[];
  groups: PullRequestGroup[];
  // The GitHub pull request for the same branch, once there is one.
  github: { number: number; url: string; state: GithubPullState } | null;
  // How it was merged; null until then, and for one merged on GitHub the
  // method and merger may be unknown.
  merge: {
    method: MergeMethod | null;
    commit: string | null;
    by: string | null;
    at: number | null;
  } | null;
}

export interface Grouping {
  prompt: string;
  submitUrl: string;
}

export interface CreatedPullRequest {
  pullRequest: PullRequestDetail;
  // Null when the server groups it.
  grouping: Grouping | null;
  links: PullRequestLinks;
}

// A new pull request, processing until it is grouped, and the private URLs
// its agent listens on for chat.
export async function createPullRequest(
  principal: Principal,
  sessionId: string,
  input: { branch: string; title: string; description?: string | null },
  linksFor: (pr: {
    id: string;
    number: number;
    repository: string;
  }) => PullRequestLinks,
  chatFor: ChatEndpointsFor,
): Promise<CreatedPullRequest & { chat: ChatEndpoints }> {
  const agent = requireAgent(principal);
  const session = await activeSession(agent, sessionId);
  requireGit();
  const repository = await authorizeId(agent, session.repositoryId, "write");
  const [open] = await getDb()
    .select({ number: pullRequests.number })
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.sessionId, session.id),
        eq(pullRequests.branch, input.branch),
        inArray(pullRequests.status, ["processing", "open"]),
      ),
    );
  if (open) {
    throw new ForgeError(
      "CONFLICT",
      `Pull request #${open.number} is already open for ${input.branch}; refresh it instead`,
    );
  }
  const diff = await readDiff(sessionSource(session), input.branch);
  const id = newEntityId("PULL_REQUEST");
  const number = await nextNumber(repository.id);
  const rules = await snapshotRules(repository.id, id);
  const groupedBy = await grouperForNewRevision();
  await getDb().batch([
    getDb()
      .insert(pullRequests)
      .values({
        id,
        repositoryId: repository.id,
        number,
        sessionId: session.id,
        agentId: agent.agentId,
        authorUserId: agent.userId,
        title: input.title,
        description: input.description ?? null,
        branch: input.branch,
        targetBranch: session.baseBranch,
        baseCommit: diff.baseCommit,
        headCommit: diff.headCommit,
        groupedBy,
      }),
    ...fileInserts(id, diff.files),
    ...commitInserts(id, diff.commits),
    ...rules,
  ]);
  await startGrouping({ pullRequestId: id, revision: 1 }, groupedBy);
  log.info("pull request created", {
    pullRequestId: id,
    repositoryId: repository.id,
    sessionId: session.id,
    files: diff.files.length,
    groupedBy,
  });
  const chat = await openChannel(agent.agentId, id, session.id, chatFor);
  return {
    ...(await withGrouping(
      repository,
      session,
      await loadDetail(principal, repository, id),
      linksFor,
    )),
    chat,
  };
}

// Re-reads the branch after the agent pushed more commits: a new revision, its
// changed files, no groups, and processing until the agent groups it again.
export async function refreshPullRequest(
  principal: Principal,
  pullRequestId: string,
  linksFor: (pr: {
    id: string;
    number: number;
    repository: string;
  }) => PullRequestLinks,
): Promise<CreatedPullRequest> {
  const { row, repository } = await authorOf(principal, pullRequestId);
  if (
    !row.sessionId ||
    (row.status !== "processing" && row.status !== "open")
  ) {
    throw new ForgeError(
      "BAD_REQUEST",
      "Only an open pull request can be refreshed",
    );
  }
  const session = await activeSession(principal, row.sessionId);
  requireGit();
  const diff = await readDiff(sessionSource(session), row.branch);
  const groupedBy = await grouperForNewRevision();
  await storeRevision(row, diff, { groupedBy });
  return withGrouping(
    repository,
    session,
    await loadDetail(principal, repository, row.id),
    linksFor,
  );
}

export interface RuleAnswer {
  rule: string;
  ranges: LineRange[];
}

// The agent's groups, and the lines each prompt rule matched.
export async function submitGroups(
  principal: Principal,
  pullRequestId: string,
  groups: GroupInput[],
  answers: RuleAnswer[] = [],
): Promise<PullRequestDetail> {
  const { row, repository, session } = await authorOf(principal, pullRequestId);
  if (row.status !== "processing" && row.status !== "open") {
    throw new ForgeError("BAD_REQUEST", "This pull request is no longer open");
  }
  if (row.groupedBy === "server") {
    log.info("agent groups refused: the server groups this revision", {
      pullRequestId: row.id,
      revision: row.revision,
    });
    throw new ForgeError(
      "FORBIDDEN",
      "This pull request is grouped on the server; it opens for review without your groups",
    );
  }
  const problems = await groupingProblems(row, session, groups, answers);
  if (problems.length > 0) {
    throw new ForgeError("BAD_REQUEST", problems.join("\n"));
  }
  await storeGroups(row, groups, answers);
  return loadDetail(principal, repository, row.id);
}

// Everything wrong with a set of groups and rule answers for this revision,
// phrased for whoever sent them.
export async function groupingProblems(
  row: PullRequestRow,
  session: Pick<Session, "artifactsName">,
  groups: GroupInput[],
  answers: RuleAnswer[],
): Promise<string[]> {
  const [files, promptRules] = await Promise.all([
    filesOf(row.id),
    promptRulesOf(row.id),
  ]);
  const references = await referenceLines(
    session.artifactsName,
    row.baseCommit,
    files,
    referencePaths(groups),
  );
  return [
    ...groupProblems(groups, files, references),
    ...answerProblems(answers, promptRules, files),
  ];
}

// Replaces the revision's groups and rule answers, and opens it for review.
export async function storeGroups(
  row: PullRequestRow,
  groups: GroupInput[],
  answers: RuleAnswer[],
): Promise<void> {
  const promptRules = await promptRulesOf(row.id);
  const answered = new Map(answers.map((a) => [a.rule, a.ranges]));
  const db = getDb();
  await db.batch([
    db
      .delete(pullRequestGroups)
      .where(eq(pullRequestGroups.pullRequestId, row.id)),
    ...promptRules.map((rule) => {
      const ranges = answered.get(rule.id) ?? [];
      return db
        .update(pullRequestRules)
        .set({ ranges, matched: ranges.length > 0 })
        .where(eq(pullRequestRules.id, rule.id));
    }),
    ...groups.map((group, position) =>
      db.insert(pullRequestGroups).values({
        id: newEntityId("PULL_REQUEST_GROUP"),
        pullRequestId: row.id,
        position,
        title: group.title,
        kind: group.kind,
        description: group.description ?? null,
        ranges: group.ranges,
      }),
    ),
    db
      .update(pullRequests)
      .set({ status: "open", processingError: null, updatedAt: new Date() })
      .where(eq(pullRequests.id, row.id)),
  ]);
  log.info("pull request grouped", {
    pullRequestId: row.id,
    revision: row.revision,
    groupedBy: row.groupedBy,
    groups: groups.length,
  });
}

export async function listPullRequests(
  principal: Principal,
  repositoryName: string,
): Promise<PullRequestSummary[]> {
  const repository = await authorize(principal, repositoryName, "read");
  const rows = await getDb()
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.repositoryId, repository.id))
    .orderBy(desc(pullRequests.number));
  return summarize(principal, repository, rows);
}

export async function getPullRequest(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<PullRequestDetail> {
  const repository = await authorize(principal, repositoryName, "read");
  const [row] = await getDb()
    .select({ id: pullRequests.id })
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repositoryId, repository.id),
        eq(pullRequests.number, number),
      ),
    );
  if (!row) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  return loadDetail(principal, repository, row.id);
}

// Who groups a revision stored now: the server when the admin turned it on
// and this deployment can, else the agent.
async function grouperForNewRevision(): Promise<Grouper> {
  return (await groupsOnServer()) ? "server" : "agent";
}

export async function startGrouping(
  job: { pullRequestId: string; revision: number },
  groupedBy: Grouper,
): Promise<void> {
  if (groupedBy === "server") {
    await enqueueJob({ kind: "group-pull-request", ...job });
  }
}

function filesOf(pullRequestId: string) {
  return getDb()
    .select()
    .from(pullRequestFiles)
    .where(eq(pullRequestFiles.pullRequestId, pullRequestId));
}

async function promptRulesOf(pullRequestId: string) {
  const rules = await getDb()
    .select({ id: pullRequestRules.id, match: pullRequestRules.match })
    .from(pullRequestRules)
    .where(eq(pullRequestRules.pullRequestId, pullRequestId));
  return rules.filter((rule) => rule.match.kind === "prompt");
}

function answerProblems(
  answers: RuleAnswer[],
  promptRules: { id: string }[],
  files: {
    path: string;
    change: FileChange;
    oldLines: number;
    newLines: number;
  }[],
): string[] {
  const known = new Set(promptRules.map((r) => r.id));
  const byPath = new Map(files.map((file) => [file.path, file]));
  return answers.flatMap((answer, a) =>
    known.has(answer.rule)
      ? answer.ranges.flatMap((range, r) =>
          rangeProblems(byPath, range, `rules[${a}].ranges[${r}]`),
        )
      : [
          `rules[${a}]: ${answer.rule} is not a prompt rule of this pull request`,
        ],
  );
}

// How many lines each reference path has on the target branch, null when it
// is not a text file there. A changed file's count is already stored; any
// other file is read from the session repository.
async function referenceLines(
  artifactsName: string,
  baseCommit: string,
  files: { path: string; change: FileChange; oldLines: number }[],
  paths: string[],
): Promise<Map<string, number | null>> {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const counted = new Map<string, number | null>();
  const unread: string[] = [];
  for (const path of paths) {
    const file = byPath.get(path);
    if (!file) {
      unread.push(path);
    } else {
      counted.set(path, file.change === "added" ? null : file.oldLines);
    }
  }
  if (unread.length === 0) {
    return counted;
  }
  requireGit();
  const versions = await getGitHost().readFiles(
    artifactsName,
    unread.map((path) => ({ ref: baseCommit, path })),
  );
  unread.forEach((path, i) => {
    const version = versions[i];
    counted.set(
      path,
      version?.kind === "text" ? countLines(version.text) : null,
    );
  });
  return counted;
}

// Where a branch is diffed from: a session's repository, or the
// repository's own for a branch mirrored from GitHub.
export interface DiffSource {
  artifactsName: string;
  baseBranch: string;
  // Where the branch was cut from; null for an empty repository.
  baseCommit: string | null;
  // The session whose transcripts the commits' trailers name, if any.
  sessionId: string | null;
}

export type BranchDiff = Awaited<ReturnType<typeof readDiff>>;

function sessionSource(
  session: Pick<Session, "id" | "artifactsName" | "baseBranch" | "baseCommit">,
): DiffSource {
  return {
    artifactsName: session.artifactsName,
    baseBranch: session.baseBranch,
    baseCommit: session.baseCommit,
    sessionId: session.id,
  };
}

// The branch against where it leaves the base, so a branch cut from an older
// commit, or one that merged the target in, shows only its own work. Its
// commits come with it, and for a session the transcript files their
// trailers name are read as transcripts rather than reviewed as code.
export async function readDiff(
  source: DiffSource,
  branch: string,
): Promise<{
  baseCommit: string;
  headCommit: string;
  files: ChangedFile[];
  commits: Commit[];
}> {
  const git = getGitHost();
  const head = await git.resolve(source.artifactsName, branch);
  if (!head) {
    throw new ForgeError(
      "BAD_REQUEST",
      source.sessionId
        ? `Branch ${branch} is not in the session repository; push it first`
        : `Branch ${branch} is not here; sync it from GitHub first`,
    );
  }
  const base = source.baseCommit
    ? await git.mergeBase(source.artifactsName, source.baseCommit, head.commit)
    : null;
  if (source.baseCommit && !base) {
    throw new ForgeError(
      "BAD_REQUEST",
      `${branch} shares no recent history with ${source.baseBranch}; merge ${source.baseBranch} into it and push again`,
    );
  }
  const [changed, commits] = await Promise.all([
    git.changedFiles(source.artifactsName, base, head),
    git.branchCommits(source.artifactsName, source.baseCommit, head.commit),
  ]);
  const transcriptFiles = source.sessionId
    ? await attachTrailerTranscripts(
        { id: source.sessionId, artifactsName: source.artifactsName },
        commits,
      )
    : new Set<string>();
  const files = changed.filter(
    (f) => !(f.change === "added" && transcriptFiles.has(f.path)),
  );
  if (files.length === 0) {
    throw new ForgeError("BAD_REQUEST", `${branch} has no changes to review`);
  }
  return {
    baseCommit: base?.commit ?? "",
    headCommit: head.commit,
    files,
    commits,
  };
}

// Stores a new revision of the pull request: its changed files and commits
// in place of the last one's, no groups, and processing until it is grouped,
// or open at once with `processingError` when nothing will group it.
// Returns the revision's number.
export async function storeRevision(
  row: Pick<PullRequestRow, "id" | "repositoryId" | "revision">,
  diff: BranchDiff,
  {
    groupedBy,
    processingError = null,
  }: { groupedBy: Grouper; processingError?: string | null },
): Promise<number> {
  const rules = await snapshotRules(row.repositoryId, row.id);
  const revision = row.revision + 1;
  const db = getDb();
  await db.batch([
    db
      .delete(pullRequestFiles)
      .where(eq(pullRequestFiles.pullRequestId, row.id)),
    db
      .delete(pullRequestGroups)
      .where(eq(pullRequestGroups.pullRequestId, row.id)),
    db
      .delete(pullRequestCommits)
      .where(eq(pullRequestCommits.pullRequestId, row.id)),
    ...fileInserts(row.id, diff.files),
    ...commitInserts(row.id, diff.commits),
    ...rules,
    db
      .update(pullRequests)
      .set({
        baseCommit: diff.baseCommit,
        headCommit: diff.headCommit,
        revision,
        status: processingError ? "open" : "processing",
        groupedBy,
        processingError,
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, row.id)),
  ]);
  log.info("pull request refreshed", {
    pullRequestId: row.id,
    revision,
    groupedBy,
  });
  await startGrouping({ pullRequestId: row.id, revision }, groupedBy);
  return revision;
}

export function commitInserts(pullRequestId: string, commits: Commit[]) {
  return commits.map((commit, position) =>
    getDb()
      .insert(pullRequestCommits)
      .values({
        id: newEntityId("PULL_REQUEST_COMMIT"),
        pullRequestId,
        position,
        sha: commit.hash,
        message: commit.message,
        authorName: commit.author,
        committedAt: new Date(commit.committedAt),
        transcriptRef: transcriptRef(commit) ?? null,
      }),
  );
}

export function fileInserts(pullRequestId: string, files: ChangedFile[]) {
  return files.map((file) =>
    getDb()
      .insert(pullRequestFiles)
      .values({
        id: newEntityId("PULL_REQUEST_FILE"),
        pullRequestId,
        path: file.path,
        change: file.change,
        oldLines: file.oldLines,
        newLines: file.newLines,
      }),
  );
}

export async function nextNumber(repositoryId: string): Promise<number> {
  const [row] = await getDb()
    .select({ last: sql<number>`coalesce(max(${pullRequests.number}), 0)` })
    .from(pullRequests)
    .where(eq(pullRequests.repositoryId, repositoryId));
  return (row?.last ?? 0) + 1;
}

async function withGrouping(
  repository: AccessibleRepository,
  session: Pick<Session, "client">,
  pullRequest: PullRequestDetail,
  linksFor: (pr: {
    id: string;
    number: number;
    repository: string;
  }) => PullRequestLinks,
): Promise<CreatedPullRequest> {
  const links = linksFor({
    id: pullRequest.id,
    number: pullRequest.number,
    repository: repository.name,
  });
  if (pullRequest.groupedBy === "server") {
    return { pullRequest, links, grouping: null };
  }
  const prompt = await fillGroupingPrompt(
    "agent",
    repository.name,
    pullRequest,
    { submitUrl: links.submitUrl, commentsUrl: links.commentsUrl },
    { claude: isClaude(session.client) },
  );
  return {
    pullRequest,
    links,
    grouping: { prompt, submitUrl: links.submitUrl },
  };
}

export async function loadDetail(
  principal: Principal,
  repository: AccessibleRepository,
  id: string,
): Promise<PullRequestDetail> {
  const db = getDb();
  const [[row], files, groups] = await Promise.all([
    db.select().from(pullRequests).where(eq(pullRequests.id, id)),
    db
      .select()
      .from(pullRequestFiles)
      .where(eq(pullRequestFiles.pullRequestId, id))
      .orderBy(pullRequestFiles.path),
    db
      .select()
      .from(pullRequestGroups)
      .where(eq(pullRequestGroups.pullRequestId, id))
      .orderBy(pullRequestGroups.position),
  ]);
  if (!row) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  const [[summary], merger] = await Promise.all([
    summarize(principal, repository, [row]),
    row.mergedBy ? getUserProfiles([row.mergedBy]) : null,
  ]);
  return {
    ...summary!,
    description: row.description,
    baseCommit: row.baseCommit,
    headCommit: row.headCommit,
    processingError: row.processingError,
    files: files.map((f) => ({
      path: f.path,
      change: f.change,
      oldLines: f.oldLines,
      newLines: f.newLines,
    })),
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.kind,
      description: g.description,
      ranges: g.ranges,
    })),
    github:
      row.githubNumber && row.githubUrl && row.githubState
        ? {
            number: row.githubNumber,
            url: row.githubUrl,
            state: row.githubState,
          }
        : null,
    merge:
      row.status === "merged"
        ? {
            method: row.mergeMethod,
            commit: row.mergeCommit,
            by: (row.mergedBy && merger?.get(row.mergedBy)?.name) ?? null,
            at: row.closedAt?.getTime() ?? null,
          }
        : null,
  };
}

async function summarize(
  principal: Principal,
  repository: AccessibleRepository,
  rows: PullRequestRow[],
): Promise<PullRequestSummary[]> {
  if (rows.length === 0) {
    return [];
  }
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const agentIds = rows.flatMap((r) => (r.agentId ? [r.agentId] : []));
  const [fileCounts, groupCounts, markCounts, agentRows, autoCounts] =
    await Promise.all([
      db
        .select({
          id: pullRequestFiles.pullRequestId,
          n: sql<number>`count(*)`,
          changes: sql<number>`coalesce(sum(json_array_length(${pullRequestFiles.changes})), 0)`,
          uncounted: sql<number>`sum(${pullRequestFiles.changes} is null)`,
        })
        .from(pullRequestFiles)
        .where(inArray(pullRequestFiles.pullRequestId, ids))
        .groupBy(pullRequestFiles.pullRequestId),
      db
        .select({
          id: pullRequestGroups.pullRequestId,
          n: sql<number>`count(*)`,
        })
        .from(pullRequestGroups)
        .where(inArray(pullRequestGroups.pullRequestId, ids))
        .groupBy(pullRequestGroups.pullRequestId),
      principal.kind === "user"
        ? db
            .select({ id: reviewMarks.pullRequestId, n: sql<number>`count(*)` })
            .from(reviewMarks)
            .where(
              and(
                inArray(reviewMarks.pullRequestId, ids),
                eq(reviewMarks.userId, principal.userId),
                eq(reviewMarks.accepted, true),
              ),
            )
            .groupBy(reviewMarks.pullRequestId)
        : Promise.resolve([]),
      agentIds.length
        ? db
            .select({
              id: agents.id,
              name: agents.name,
              owner: agents.ownerUserId,
            })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : Promise.resolve([]),
      autoAcceptedCounts(principal, ids),
    ]);
  const owners = await getUserProfiles([
    ...agentRows.map((a) => a.owner),
    ...rows.flatMap((r) =>
      r.origin === "github" && r.authorUserId ? [r.authorUserId] : [],
    ),
  ]);
  const files = new Map(fileCounts.map((c) => [c.id, c]));
  const marks = new Map(markCounts.map((c) => [c.id, c.n]));
  const groupsBy = new Map(groupCounts.map((c) => [c.id, c.n]));
  const agentsBy = new Map(agentRows.map((a) => [a.id, a]));
  return rows.map((row) => {
    const agent = row.agentId ? agentsBy.get(row.agentId) : undefined;
    const counted = files.get(row.id);
    return {
      id: row.id,
      number: row.number,
      repository: repository.name,
      title: row.title,
      status: row.status,
      branch: row.branch,
      targetBranch: row.targetBranch,
      revision: row.revision,
      groupedBy: row.groupedBy,
      origin: row.origin,
      openedBy:
        row.origin === "github" && row.authorUserId
          ? (owners.get(row.authorUserId)?.name ?? null)
          : null,
      agent: agent
        ? { name: agent.name, ownerName: owners.get(agent.owner)?.name ?? null }
        : null,
      fileCount: files.get(row.id)?.n ?? 0,
      groupCount: groupsBy.get(row.id) ?? 0,
      review: {
        changes: counted?.uncounted ? null : (counted?.changes ?? 0),
        accepted: (marks.get(row.id) ?? 0) + (autoCounts.get(row.id) ?? 0),
      },
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  });
}
