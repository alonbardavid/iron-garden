import { MAX_ACCEPT_CHANGES } from "@lib/contract";
import { changesOf, diffLines, WHOLE_FILE } from "@lib/diff";
import {
  agentSessions,
  and,
  asc,
  eq,
  getDb,
  inArray,
  newEntityId,
  pullRequestFiles,
  pullRequestRules,
  pullRequests,
  repositories,
  reviewMarks,
  sql,
  type DispatchStatus,
  type RuleAction,
  type RuleMatch,
  type RuleWorkflow,
} from "@lib/db-models";
import { authorize, ForgeError } from "@lib/forge";
import type { FileVersion } from "@lib/git-host";
import { getUserProfiles, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { readContents } from "./files";
import { repositoryJoin, sessionJoin, storageName } from "./storage";
import {
  autoAccepted,
  matchFile,
  ruleFiles,
  type MatchedFile,
} from "./rules/evaluate";
import { memberIds } from "./rules/rules";

const log = moduleLogger("review/marks");

// Files diffed at once when a pull request's changes are first counted, so a
// large one never holds every file's text in memory.
const DIFF_BATCH = 8;
// Rows per statement, under D1's 100 bound parameters.
const INSERT_ROWS = 14;
const IN_LIST = 90;

export interface ReviewFile {
  path: string;
  // Every change in the file, and `at`, the line group ranges find it by.
  changes: { key: string; at: number }[];
  // The keys of the changes this reviewer accepted, or a rule accepted for
  // them.
  accepted: string[];
  // Of those, the ones a rule accepted.
  auto: string[];
}

export interface ReviewRule {
  id: string;
  ruleId: string | null;
  name: string;
  match: RuleMatch;
  action: RuleAction;
  // For require-review: each reviewer, and whether they accepted every
  // matched change themselves.
  reviewers: { id: string; name: string; done: boolean }[];
  // For run-workflow: the workflow, and whether GitHub started it.
  workflow: RuleWorkflow | null;
  dispatch: { status: DispatchStatus; error: string | null } | null;
  files: { path: string; keys: string[] }[];
}

// A run-workflow rule that matched a revision.
export interface WorkflowRuleRun {
  id: string;
  name: string;
  workflow: RuleWorkflow;
  dispatchStatus: DispatchStatus | null;
}

export interface Review {
  revision: number;
  files: ReviewFile[];
  rules: ReviewRule[];
}

export interface ChangeSelection {
  path: string;
  keys: string[];
}

type ReviewedPullRequest = {
  id: string;
  repositoryId: string;
  revision: number;
  baseCommit: string;
  headCommit: string;
  artifactsName: string | null;
};

type PullRequestRule = typeof pullRequestRules.$inferSelect;

// The pull request's changes, file by file, and which of them this principal
// accepted. An agent has accepted nothing.
export async function getReview(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<Review> {
  const pr = await findPullRequest(principal, repositoryName, number);
  const rules = await rulesOf(pr.id);
  return reviewOf(pr, await fileChanges(pr, rules), rules, principal);
}

// The run-workflow rules the pull request's current revision matched,
// counting its changes first if no one has opened it yet. A prompt rule
// matches only once the agent has judged it.
export async function matchedWorkflowRules(
  pullRequestId: string,
): Promise<WorkflowRuleRun[]> {
  const pr = await pullRequestById(pullRequestId);
  const rules = await rulesOf(pr.id);
  const workflowRules = rules.filter(
    (rule) => rule.action === "run-workflow" && rule.workflow,
  );
  if (workflowRules.length === 0) {
    return [];
  }
  const files = await fileChanges(pr, rules);
  return workflowRules
    .filter((rule) => ruleFiles(rule, files).length > 0)
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      workflow: rule.workflow!,
      dispatchStatus: rule.dispatchStatus,
    }));
}

export async function recordDispatch(
  ruleRunId: string,
  status: DispatchStatus,
  error: string | null = null,
): Promise<void> {
  await getDb()
    .update(pullRequestRules)
    .set({ dispatchStatus: status, dispatchError: error })
    .where(eq(pullRequestRules.id, ruleRunId));
}

// Accepts the given changes, or undoes accepting them, for the person asking.
// Undoing a change a rule accepted turns the rule off for it, for this
// person; accepting it again makes it their own accept. Accepting a change a
// rule already accepts leaves it to the rule.
export async function acceptChanges(
  principal: Principal,
  repositoryName: string,
  number: number,
  accepted: boolean,
  selection: ChangeSelection[],
): Promise<Review> {
  if (principal.kind !== "user") {
    throw new ForgeError("FORBIDDEN", "Only people accept changes");
  }
  const pr = await findPullRequest(principal, repositoryName, number);
  const rules = await rulesOf(pr.id);
  const files = await fileChanges(pr, rules);
  const known = new Set(
    files.flatMap((f) => f.changes.map(([key]) => `${f.path}\n${key}`)),
  );
  const marks = selection.flatMap(({ path, keys }) =>
    keys.map((key) => ({ path, key })),
  );
  if (marks.length > MAX_ACCEPT_CHANGES) {
    throw new ForgeError(
      "BAD_REQUEST",
      `Accept at most ${MAX_ACCEPT_CHANGES} changes at once; got ${marks.length}`,
    );
  }
  const unknown = marks.filter((m) => !known.has(`${m.path}\n${m.key}`));
  if (unknown.length > 0) {
    throw new ForgeError(
      "BAD_REQUEST",
      `${unknown.length} of these changes are not in revision ${pr.revision}; reload the pull request`,
    );
  }
  const auto = autoAccepted(rules, files);
  const own = new Set(
    (await marksOf(pr.id, principal.userId)).map((m) => `${m.path}\n${m.key}`),
  );
  const byRule = (m: { path: string; key: string }) => {
    const id = `${m.path}\n${m.key}`;
    return auto.has(id) && !own.has(id);
  };
  const db = getDb();
  const upsert = (rows: { path: string; key: string }[], value: boolean) =>
    chunks(rows, INSERT_ROWS).map((some) =>
      db
        .insert(reviewMarks)
        .values(
          some.map((mark) => ({
            id: newEntityId("REVIEW_MARK"),
            pullRequestId: pr.id,
            userId: principal.userId,
            path: mark.path,
            key: mark.key,
            accepted: value,
            revision: pr.revision,
          })),
        )
        .onConflictDoUpdate({
          target: [
            reviewMarks.pullRequestId,
            reviewMarks.userId,
            reviewMarks.path,
            reviewMarks.key,
          ],
          set: {
            accepted: sql`excluded.accepted`,
            revision: sql`excluded.revision`,
          },
        }),
    );
  const ruled = marks.filter((m) => auto.has(`${m.path}\n${m.key}`));
  const plain = selection.flatMap(({ path, keys }) => {
    const rest = keys.filter((key) => !auto.has(`${path}\n${key}`));
    return rest.length ? [{ path, keys: rest }] : [];
  });
  const statements = accepted
    ? upsert(
        marks.filter((m) => !byRule(m)),
        true,
      )
    : [
        ...upsert(ruled, false),
        ...plain.flatMap(({ path, keys }) =>
          chunks(keys, IN_LIST).map((some) =>
            db
              .delete(reviewMarks)
              .where(
                and(
                  eq(reviewMarks.pullRequestId, pr.id),
                  eq(reviewMarks.userId, principal.userId),
                  eq(reviewMarks.path, path),
                  inArray(reviewMarks.key, some),
                ),
              ),
          ),
        ),
      ];
  await runAll(statements);
  log.info(accepted ? "changes accepted" : "changes unaccepted", {
    pullRequestId: pr.id,
    userId: principal.userId,
    changes: marks.length,
  });
  return reviewOf(pr, files, rules, principal);
}

// For each pull request, how many changes rules accepted for this person
// that they have not marked themselves.
export async function autoAcceptedCounts(
  principal: Principal,
  pullRequestIds: string[],
): Promise<Map<string, number>> {
  if (principal.kind !== "user" || pullRequestIds.length === 0) {
    return new Map();
  }
  const db = getDb();
  const rules = await db
    .select()
    .from(pullRequestRules)
    .where(
      and(
        inArray(pullRequestRules.pullRequestId, pullRequestIds),
        eq(pullRequestRules.action, "auto-accept"),
      ),
    );
  const ids = [...new Set(rules.map((r) => r.pullRequestId))];
  if (ids.length === 0) {
    return new Map();
  }
  const [files, marks] = await Promise.all([
    db
      .select({
        pullRequestId: pullRequestFiles.pullRequestId,
        path: pullRequestFiles.path,
        changes: pullRequestFiles.changes,
        matches: pullRequestFiles.matches,
      })
      .from(pullRequestFiles)
      .where(inArray(pullRequestFiles.pullRequestId, ids)),
    db
      .select({
        pullRequestId: reviewMarks.pullRequestId,
        path: reviewMarks.path,
        key: reviewMarks.key,
      })
      .from(reviewMarks)
      .where(
        and(
          inArray(reviewMarks.pullRequestId, ids),
          eq(reviewMarks.userId, principal.userId),
        ),
      ),
  ]);
  return new Map(
    ids.map((id) => {
      const own = new Set(
        marks
          .filter((m) => m.pullRequestId === id)
          .map((m) => `${m.path}\n${m.key}`),
      );
      const auto = autoAccepted(
        rules.filter((r) => r.pullRequestId === id),
        files.filter((f) => f.pullRequestId === id).map(matchedFile),
      );
      return [id, [...auto].filter((change) => !own.has(change)).length];
    }),
  );
}

async function rulesOf(pullRequestId: string): Promise<PullRequestRule[]> {
  return getDb()
    .select()
    .from(pullRequestRules)
    .where(eq(pullRequestRules.pullRequestId, pullRequestId))
    .orderBy(asc(pullRequestRules.position));
}

function marksOf(pullRequestId: string, userId: string) {
  return getDb()
    .select({
      path: reviewMarks.path,
      key: reviewMarks.key,
      accepted: reviewMarks.accepted,
    })
    .from(reviewMarks)
    .where(
      and(
        eq(reviewMarks.pullRequestId, pullRequestId),
        eq(reviewMarks.userId, userId),
      ),
    );
}

function matchedFile(row: {
  path: string;
  changes: [string, number][] | null;
  matches: Record<string, string[]> | null;
}): MatchedFile {
  return {
    path: row.path,
    changes: row.changes ?? [],
    matches: row.matches ?? {},
  };
}

async function findPullRequest(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<ReviewedPullRequest> {
  const repository = await authorize(principal, repositoryName, "read");
  return reviewedPullRequest(
    and(
      eq(pullRequests.repositoryId, repository.id),
      eq(pullRequests.number, number),
    ),
  );
}

function pullRequestById(id: string): Promise<ReviewedPullRequest> {
  return reviewedPullRequest(eq(pullRequests.id, id));
}

async function reviewedPullRequest(
  where: ReturnType<typeof eq> | undefined,
): Promise<ReviewedPullRequest> {
  const [row] = await getDb()
    .select({
      id: pullRequests.id,
      repositoryId: pullRequests.repositoryId,
      revision: pullRequests.revision,
      baseCommit: pullRequests.baseCommit,
      headCommit: pullRequests.headCommit,
      artifactsName: storageName,
    })
    .from(pullRequests)
    .leftJoin(agentSessions, sessionJoin)
    .innerJoin(repositories, repositoryJoin)
    .where(where);
  if (!row) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  return row;
}

// Each file's changes and what pattern rules matched in it, diffing the
// files no one has opened since this revision was pushed. Marks on changes
// the new revision no longer has are dropped.
async function fileChanges(
  pr: ReviewedPullRequest,
  rules: PullRequestRule[],
): Promise<MatchedFile[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: pullRequestFiles.id,
      path: pullRequestFiles.path,
      change: pullRequestFiles.change,
      changes: pullRequestFiles.changes,
      matches: pullRequestFiles.matches,
    })
    .from(pullRequestFiles)
    .where(eq(pullRequestFiles.pullRequestId, pr.id))
    .orderBy(pullRequestFiles.path);
  const missing = rows.filter((row) => row.changes === null);
  if (missing.length > 0 && pr.artifactsName) {
    for (const batch of chunks(missing, DIFF_BATCH)) {
      const contents = await readContents(pr.artifactsName, pr, batch);
      batch.forEach((row, i) => {
        const { changes, text } = changesFor(
          contents[i]!.before,
          contents[i]!.after,
        );
        row.changes = changes;
        row.matches = matchFile(rules, row.path, changes, text);
      });
    }
    const matched = new Set(
      missing.flatMap((row) => Object.keys(row.matches ?? {})),
    );
    await runAll([
      ...missing.map((row) =>
        db
          .update(pullRequestFiles)
          .set({ changes: row.changes, matches: row.matches })
          .where(eq(pullRequestFiles.id, row.id)),
      ),
      ...rules
        .filter((rule) => rule.match.kind !== "prompt")
        .map((rule) =>
          db
            .update(pullRequestRules)
            .set({ matched: matched.has(rule.id) })
            .where(eq(pullRequestRules.id, rule.id)),
        ),
    ]);
    await dropStaleMarks(pr.id, rows);
    log.info("pull request changes counted", {
      pullRequestId: pr.id,
      files: missing.length,
    });
  }
  return rows.map(matchedFile);
}

function changesFor(
  before: FileVersion | null,
  after: FileVersion | null,
): {
  changes: [string, number][];
  text: Parameters<typeof matchFile>[3];
} {
  if (
    before?.kind === "binary" ||
    before?.kind === "too-large" ||
    after?.kind === "binary" ||
    after?.kind === "too-large"
  ) {
    return { changes: [[WHOLE_FILE, 1]], text: null };
  }
  const text = { before: before?.text ?? "", after: after?.text ?? "" };
  const lines = diffLines(text.before, text.after);
  return {
    changes: changesOf(lines).map((change) => [change.key, change.at]),
    text: { ...text, lines },
  };
}

async function dropStaleMarks(
  pullRequestId: string,
  files: { path: string; changes: [string, number][] | null }[],
): Promise<void> {
  const current = new Set(
    files.flatMap((f) => (f.changes ?? []).map(([key]) => `${f.path}\n${key}`)),
  );
  const marks = await getDb()
    .select({
      id: reviewMarks.id,
      path: reviewMarks.path,
      key: reviewMarks.key,
    })
    .from(reviewMarks)
    .where(eq(reviewMarks.pullRequestId, pullRequestId));
  const stale = marks
    .filter((m) => !current.has(`${m.path}\n${m.key}`))
    .map((m) => m.id);
  await runAll(
    chunks(stale, IN_LIST).map((ids) =>
      getDb().delete(reviewMarks).where(inArray(reviewMarks.id, ids)),
    ),
  );
}

async function reviewOf(
  pr: ReviewedPullRequest,
  files: MatchedFile[],
  rules: PullRequestRule[],
  principal: Principal,
): Promise<Review> {
  const marks =
    principal.kind === "user" ? await marksOf(pr.id, principal.userId) : [];
  const own = new Map(marks.map((m) => [`${m.path}\n${m.key}`, m.accepted]));
  const auto = principal.kind === "user" ? autoAccepted(rules, files) : null;
  const byRule = (id: string) => !!auto?.has(id) && !own.has(id);
  return {
    revision: pr.revision,
    files: files.map(({ path, changes }) => ({
      path,
      changes: changes.map(([key, at]) => ({ key, at })),
      accepted: changes.flatMap(([key]) => {
        const id = `${path}\n${key}`;
        return own.get(id) === true || byRule(id) ? [key] : [];
      }),
      auto: changes.flatMap(([key]) =>
        byRule(`${path}\n${key}`) ? [key] : [],
      ),
    })),
    rules: await reviewRules(pr, files, rules),
  };
}

// Each rule with the changes it matched, and for require-review which of
// its reviewers accepted all of them. A reviewer who is no longer a member
// is skipped.
async function reviewRules(
  pr: ReviewedPullRequest,
  files: MatchedFile[],
  rules: PullRequestRule[],
): Promise<ReviewRule[]> {
  const reviewerIds = [
    ...new Set(
      rules
        .filter((r) => r.action === "require-review")
        .flatMap((r) => r.reviewers),
    ),
  ];
  const [members, people, marks] = reviewerIds.length
    ? await Promise.all([
        memberIds(pr.repositoryId),
        getUserProfiles(reviewerIds),
        getDb()
          .select({
            userId: reviewMarks.userId,
            path: reviewMarks.path,
            key: reviewMarks.key,
          })
          .from(reviewMarks)
          .where(
            and(
              eq(reviewMarks.pullRequestId, pr.id),
              inArray(reviewMarks.userId, reviewerIds),
              eq(reviewMarks.accepted, true),
            ),
          ),
      ])
    : [new Set<string>(), new Map(), []];
  return rules.map((rule) => {
    const matched = ruleFiles(rule, files);
    return {
      id: rule.id,
      ruleId: rule.ruleId,
      name: rule.name,
      match: rule.match,
      action: rule.action,
      reviewers:
        rule.action === "require-review"
          ? rule.reviewers.flatMap((id) => {
              const person = people.get(id);
              if (!person || !members.has(id)) {
                return [];
              }
              const accepted = new Set(
                marks
                  .filter((m) => m.userId === id)
                  .map((m) => `${m.path}\n${m.key}`),
              );
              return [
                {
                  id,
                  name: person.name,
                  done: matched.every(({ path, keys }) =>
                    keys.every((key) => accepted.has(`${path}\n${key}`)),
                  ),
                },
              ];
            })
          : [],
      workflow: rule.workflow,
      dispatch: rule.dispatchStatus
        ? { status: rule.dispatchStatus, error: rule.dispatchError }
        : null,
      files: matched,
    };
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

// One D1 batch for any number of statements, none for zero.
async function runAll(
  statements: Parameters<ReturnType<typeof getDb>["batch"]>[0][number][],
): Promise<void> {
  const [first, ...rest] = statements;
  if (first) {
    await getDb().batch([first, ...rest]);
  }
}
