import {
  getDb,
  pullRequestRules,
  pullRequests,
  repositoryMembers,
  repositoryRules,
  newEntityId,
  and,
  asc,
  desc,
  eq,
  inArray,
  paginate,
  matchesAllTerms,
  searchTerms,
  type ListRequest,
  type ListResult,
  ne,
  type RuleAction,
  type RuleMatch,
  type RuleWorkflow,
} from "@lib/db-models";
import { authorize, ForgeError, type AccessibleRepository } from "@lib/forge";
import { getUserProfiles, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { patternProblem } from "@lib/collab";
import { EXCLUSIVE_NEEDS_FILES } from "@lib/contract";

const log = moduleLogger("review/rules/rules");

// How many of the repository's latest pull requests "recent" counts.
const RECENT = 10;

export interface RuleInput {
  name: string;
  match: RuleMatch;
  action: RuleAction;
  reviewers: string[];
  workflow?: RuleWorkflow | null;
  enabled: boolean;
}

export interface Rule {
  id: string;
  name: string;
  match: RuleMatch;
  action: RuleAction;
  reviewers: { id: string; name: string }[];
  workflow: RuleWorkflow | null;
  enabled: boolean;
  lastMatched: { number: number; at: number } | null;
  recent: { matched: number; of: number };
  createdAt: number;
  updatedAt: number;
}

// A rule of another repository, and whether this one already has a rule of
// the same name that matches the same way.
export interface CopyableRule extends Rule {
  already: boolean;
}

export type RuleListRequest = ListRequest<"createdAt" | "name"> & {
  q?: string;
};

type RuleRow = typeof repositoryRules.$inferSelect;

// Anyone who can read a repository can read its rules, so they can be copied
// from it; only its admins change them.
export async function listRules(
  principal: Principal,
  repositoryName: string,
  request: RuleListRequest,
): Promise<ListResult<Rule>> {
  const repository = await authorize(principal, repositoryName, "read");
  const page = await pageOfRules(repository, request);
  return { ...page, items: await describe(repository, page.items) };
}

// A page of `fromName`'s rules to copy into this repository, each marked
// `already` when this one has a rule of the same name that matches the same
// way.
export async function listCopyableRules(
  principal: Principal,
  repositoryName: string,
  fromName: string,
  request: RuleListRequest,
): Promise<ListResult<CopyableRule>> {
  const repository = await authorize(principal, repositoryName, "read");
  const from = await authorize(principal, fromName, "read");
  const page = await pageOfRules(from, request);
  const names = [...new Set(page.items.map((row) => row.name))];
  const [rules, ours] = await Promise.all([
    describe(from, page.items),
    names.length
      ? getDb()
          .select({ name: repositoryRules.name, match: repositoryRules.match })
          .from(repositoryRules)
          .where(
            and(
              eq(repositoryRules.repositoryId, repository.id),
              inArray(repositoryRules.name, names),
            ),
          )
      : Promise.resolve([]),
  ]);
  const here = new Set(ours.map(ruleKey));
  const items = rules.map((rule) => ({
    ...rule,
    already: here.has(ruleKey(rule)),
  }));
  log.debug("copyable rules read", {
    repositoryId: repository.id,
    fromRepositoryId: from.id,
    rules: items.length,
    already: items.filter((rule) => rule.already).length,
  });
  return { ...page, items };
}

export async function getRule(
  principal: Principal,
  repositoryName: string,
  id: string,
): Promise<Rule> {
  const repository = await authorize(principal, repositoryName, "read");
  const [rule] = await describe(repository, [await findRule(repository, id)]);
  return rule!;
}

export async function createRule(
  principal: Principal,
  repositoryName: string,
  input: RuleInput,
): Promise<Rule> {
  const repository = await authorize(principal, repositoryName, "admin");
  await checkRule(repository, input);
  const id = newEntityId("REPOSITORY_RULE");
  await getDb()
    .insert(repositoryRules)
    .values({
      id,
      repositoryId: repository.id,
      ...ruleColumns(input),
      createdBy: principal.userId,
    });
  log.info("rule created", { repositoryId: repository.id, ruleId: id });
  return getRule(principal, repositoryName, id);
}

export async function updateRule(
  principal: Principal,
  repositoryName: string,
  id: string,
  input: RuleInput,
): Promise<Rule> {
  const repository = await authorize(principal, repositoryName, "admin");
  await findRule(repository, id);
  await checkRule(repository, input);
  await getDb()
    .update(repositoryRules)
    .set({ ...ruleColumns(input), updatedAt: new Date() })
    .where(eq(repositoryRules.id, id));
  log.info("rule updated", { repositoryId: repository.id, ruleId: id });
  return getRule(principal, repositoryName, id);
}

export async function setRuleEnabled(
  principal: Principal,
  repositoryName: string,
  id: string,
  enabled: boolean,
): Promise<Rule> {
  const repository = await authorize(principal, repositoryName, "admin");
  await findRule(repository, id);
  await getDb()
    .update(repositoryRules)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(repositoryRules.id, id));
  log.info(enabled ? "rule turned on" : "rule turned off", {
    repositoryId: repository.id,
    ruleId: id,
  });
  return getRule(principal, repositoryName, id);
}

export async function deleteRule(
  principal: Principal,
  repositoryName: string,
  id: string,
): Promise<void> {
  const repository = await authorize(principal, repositoryName, "admin");
  await findRule(repository, id);
  await getDb().delete(repositoryRules).where(eq(repositoryRules.id, id));
  log.info("rule deleted", { repositoryId: repository.id, ruleId: id });
}

// Copies are independent of the rules they came from. Reviewers come along
// only if they are members here too. A run-workflow rule comes along only if
// this repository has a workflow at the same path (`workflows`, by path),
// and then starts that one; the others are dropped and named in `dropped`.
export async function copyRules(
  principal: Principal,
  repositoryName: string,
  fromName: string,
  ids: string[],
  workflows: Map<string, RuleWorkflow>,
): Promise<{ rules: Rule[]; dropped: string[] }> {
  const repository = await authorize(principal, repositoryName, "admin");
  const from = await authorize(principal, fromName, "read");
  if (from.id === repository.id) {
    throw new ForgeError("BAD_REQUEST", "Pick another repository to copy from");
  }
  const rows = await getDb()
    .select()
    .from(repositoryRules)
    .where(
      and(
        eq(repositoryRules.repositoryId, from.id),
        inArray(repositoryRules.id, ids),
      ),
    );
  if (rows.length !== new Set(ids).size) {
    throw new ForgeError(
      "BAD_REQUEST",
      `Some of these rules are not in ${from.name}`,
    );
  }
  const members = await memberIds(repository.id);
  const workflowHere = (row: RuleRow) =>
    row.workflow ? workflows.get(row.workflow.path) : undefined;
  const dropped = rows.filter(
    (row) => row.action === "run-workflow" && !workflowHere(row),
  );
  const copied = rows
    .filter((row) => !dropped.includes(row))
    .map((row) => ({
      ...row,
      id: newEntityId("REPOSITORY_RULE"),
      repositoryId: repository.id,
      reviewers: row.reviewers.filter((r) => members.has(r)),
      workflow: workflowHere(row) ?? null,
      createdBy: principal.userId,
      createdAt: undefined,
      updatedAt: undefined,
    }));
  const db = getDb();
  const [first, ...rest] = copied.map((row) =>
    db.insert(repositoryRules).values(row),
  );
  if (first) {
    await db.batch([first, ...rest]);
  }
  log.info("rules copied", {
    repositoryId: repository.id,
    fromRepositoryId: from.id,
    rules: copied.length,
    dropped: dropped.length,
  });
  const added = copied.length
    ? await db
        .select()
        .from(repositoryRules)
        .where(
          inArray(
            repositoryRules.id,
            copied.map((c) => c.id),
          ),
        )
        .orderBy(asc(repositoryRules.createdAt), asc(repositoryRules.id))
    : [];
  return {
    rules: await describe(repository, added),
    dropped: dropped.map((row) => row.name),
  };
}

// The repository's review rules that are on, as statements that store them
// with a pull request's new revision. Mark-exclusive rules govern sessions as
// they work, not a review, so they stay behind.
export async function snapshotRules(
  repositoryId: string,
  pullRequestId: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(repositoryRules)
    .where(
      and(
        eq(repositoryRules.repositoryId, repositoryId),
        eq(repositoryRules.enabled, true),
        ne(repositoryRules.action, "mark-exclusive"),
      ),
    )
    .orderBy(asc(repositoryRules.createdAt));
  return [
    db
      .delete(pullRequestRules)
      .where(eq(pullRequestRules.pullRequestId, pullRequestId)),
    ...rows.map((rule, position) =>
      db.insert(pullRequestRules).values({
        id: newEntityId("PULL_REQUEST_RULE"),
        pullRequestId,
        ruleId: rule.id,
        position,
        name: rule.name,
        match: rule.match,
        action: rule.action,
        reviewers: rule.reviewers,
        workflow: rule.workflow,
      }),
    ),
  ];
}

// The repository's rules a page at a time, oldest first unless `sort` says
// otherwise; `q` keeps those whose name holds every word of it.
function pageOfRules(
  repository: AccessibleRepository,
  request: RuleListRequest,
) {
  return paginate(
    getDb()
      .select()
      .from(repositoryRules)
      .where(eq(repositoryRules.repositoryId, repository.id))
      .$dynamic(),
    request,
    {
      defaultSort: "createdAt",
      filters: {
        q: (q) => matchesAllTerms(repositoryRules.name, searchTerms(q)),
      },
    },
  );
}

// Two rules are the same when they share a name and match the same way.
function ruleKey(rule: { name: string; match: RuleMatch }): string {
  return JSON.stringify([rule.name, rule.match]);
}

async function findRule(
  repository: AccessibleRepository,
  id: string,
): Promise<RuleRow> {
  const [row] = await getDb()
    .select()
    .from(repositoryRules)
    .where(
      and(
        eq(repositoryRules.repositoryId, repository.id),
        eq(repositoryRules.id, id),
      ),
    );
  if (!row) {
    throw new ForgeError("NOT_FOUND", "Rule not found");
  }
  return row;
}

async function checkRule(
  repository: AccessibleRepository,
  input: RuleInput,
): Promise<void> {
  const { match } = input;
  const problems =
    match.kind === "files"
      ? match.patterns.map((p) => patternProblem(p, match.syntax))
      : match.paths.map((p) => patternProblem(p, "glob"));
  const problem = problems.find((p) => p !== null);
  if (problem) {
    throw new ForgeError("BAD_REQUEST", problem);
  }
  if (input.action === "mark-exclusive" && match.kind !== "files") {
    throw new ForgeError("BAD_REQUEST", EXCLUSIVE_NEEDS_FILES);
  }
  if (input.action === "run-workflow" && !input.workflow) {
    throw new ForgeError("BAD_REQUEST", "Pick the workflow to run");
  }
  if (input.action !== "require-review") {
    return;
  }
  if (input.reviewers.length === 0) {
    throw new ForgeError("BAD_REQUEST", "Add at least one reviewer");
  }
  const members = await memberIds(repository.id);
  if (input.reviewers.some((r) => !members.has(r))) {
    throw new ForgeError(
      "BAD_REQUEST",
      `Reviewers must be members of ${repository.name}`,
    );
  }
}

function ruleColumns(input: RuleInput) {
  return {
    name: input.name,
    match: input.match,
    action: input.action,
    reviewers: input.action === "require-review" ? input.reviewers : [],
    workflow: input.action === "run-workflow" ? (input.workflow ?? null) : null,
    enabled: input.enabled,
  };
}

export async function memberIds(repositoryId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ userId: repositoryMembers.userId })
    .from(repositoryMembers)
    .where(eq(repositoryMembers.repositoryId, repositoryId));
  return new Set(rows.map((r) => r.userId));
}

async function describe(
  repository: AccessibleRepository,
  rows: RuleRow[],
): Promise<Rule[]> {
  if (rows.length === 0) {
    return [];
  }
  const db = getDb();
  const [recentRows, matchRows, people] = await Promise.all([
    db
      .select({ id: pullRequests.id })
      .from(pullRequests)
      .where(eq(pullRequests.repositoryId, repository.id))
      .orderBy(desc(pullRequests.number))
      .limit(RECENT),
    db
      .select({
        ruleId: pullRequestRules.ruleId,
        pullRequestId: pullRequestRules.pullRequestId,
        number: pullRequests.number,
        at: pullRequestRules.createdAt,
      })
      .from(pullRequestRules)
      .innerJoin(
        pullRequests,
        eq(pullRequests.id, pullRequestRules.pullRequestId),
      )
      .where(
        and(
          inArray(
            pullRequestRules.ruleId,
            rows.map((r) => r.id),
          ),
          eq(pullRequestRules.matched, true),
        ),
      )
      .orderBy(desc(pullRequests.number)),
    getUserProfiles(rows.flatMap((r) => r.reviewers)),
  ]);
  const recent = new Set(recentRows.map((r) => r.id));
  return rows.map((row) => {
    const matches = matchRows.filter((m) => m.ruleId === row.id);
    const last = matches[0];
    return {
      id: row.id,
      name: row.name,
      match: row.match,
      action: row.action,
      reviewers: row.reviewers.flatMap((id) => {
        const person = people.get(id);
        return person ? [{ id, name: person.name }] : [];
      }),
      workflow: row.workflow,
      enabled: row.enabled,
      lastMatched: last ? { number: last.number, at: last.at.getTime() } : null,
      recent: {
        matched: new Set(
          matches
            .filter((m) => recent.has(m.pullRequestId))
            .map((m) => m.pullRequestId),
        ).size,
        of: recent.size,
      },
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  });
}
