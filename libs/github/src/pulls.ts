import { authorize, ForgeError } from "@lib/forge";
import {
  deleteRefs,
  getGitHost,
  listRefs,
  type MergeMethod,
} from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import {
  copyReviewedHead,
  getPullRequest,
  linkGithub,
  markClosed,
  markMerged,
  markReopened,
  matchedWorkflowRules,
  mergeablePullRequest,
  mergeLocally,
  mergeMessage,
  pullRequestsOnBranch,
  pullRequestWithFork,
  recordDispatch,
  type MergeablePullRequest,
  type WorkflowRuleRun,
} from "@lib/review";
import { GithubError, githubApi, gitRemote, type GithubApi } from "./api";
import { connectionOf } from "./connections";
import type {
  CheckRunPayload,
  CommitStatusPayload,
  PullPayload,
} from "./payloads";
import { refreshRunsAt, runsAt, type WorkflowRun } from "./runs";
import { connectionToken, syncConnection, type ConnectionRow } from "./sync";

const log = moduleLogger("github/pulls");

// Long enough to copy a branch's objects to GitHub.
const PUBLISH_TOKEN_TTL_SECONDS = 10 * 60;

export interface GithubCheck {
  name: string;
  // A check run (GitHub Actions and apps) or a commit status (older CI).
  source: "check" | "status";
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  url: string | null;
}

export interface GithubPullStatus {
  // Whether the repository is connected to GitHub at all.
  connected: boolean;
  pull: {
    number: number;
    url: string;
    state: "open" | "closed" | "merged";
    draft: boolean;
    // GitHub's own verdict: null while it is still working it out.
    mergeable: boolean | null;
    mergeableState: string | null;
    headSha: string;
  } | null;
  checks: GithubCheck[];
  runs: WorkflowRun[];
}

type PullRequestRow = MergeablePullRequest["row"];

// What GitHub says about the pull request: the GitHub pull request for its
// branch (linked the first time one is found), and the checks and workflow
// runs on its head. A GitHub pull request merged or closed meanwhile is
// carried over.
export async function githubPullStatus(
  principal: Principal,
  name: string,
  number: number,
): Promise<GithubPullStatus> {
  const detail = await getPullRequest(principal, name, number);
  const repository = await authorize(principal, name, "read");
  const connection = await connectionOf(repository.id);
  if (!connection) {
    return { connected: false, pull: null, checks: [], runs: [] };
  }
  const api = githubApi(await connectionToken(connection));
  const pull = await currentPull(connection, api, detail.id);
  if (!pull) {
    const runs = await runsAt(repository.id, detail.headCommit);
    return { connected: true, pull: null, checks: [], runs };
  }
  const runs = await refreshRunsAt(connection, api, pull.head.sha);
  const checks = await checksAt(connection, api, pull.head.sha, runs);
  return { connected: true, pull: pullView(pull), checks, runs };
}

// Opens a GitHub pull request for a branch that has none: the reviewed head
// is pushed to a branch of the same name, which must not already exist on
// GitHub at another commit.
export async function createGithubPullRequest(
  principal: Principal,
  name: string,
  number: number,
): Promise<void> {
  const pr = await mergeablePullRequest(principal, name, number);
  const connection = await requireConnection(pr.repositoryId);
  if (pr.row.githubNumber) {
    throw new ForgeError(
      "CONFLICT",
      `GitHub pull request #${pr.row.githubNumber} already stands for this one`,
    );
  }
  const token = await connectionToken(connection);
  await publishBranch(pr.row, pr.sessionArtifactsName, connection, token, {
    overwrite: false,
  });
  const api = githubApi(token);
  await openOnGithub(pr.row, connection, api);
  await dispatchWorkflowRules(pr.row.id, connection, api);
}

// Merges by `method`. A repository connected to GitHub merges there, and
// only once its GitHub pull request exists; GitHub's push then brings the
// result back. Otherwise the merge happens in this instance's storage.
export async function mergePullRequest(
  principal: Principal,
  name: string,
  number: number,
  method: MergeMethod,
): Promise<void> {
  const pr = await mergeablePullRequest(principal, name, number);
  const connection = await connectionOf(pr.repositoryId);
  if (!connection) {
    await mergeLocally(principal, pr, method);
    return;
  }
  await mergeOnGithub(principal, pr.row, connection, method);
  await syncConnection(connection, [pr.row.targetBranch]);
}

// After a new revision or its grouping: the GitHub branch follows the
// reviewed head, and the run-workflow rules it matched are started. GitHub
// being down never fails the agent's request; the rules record why.
export async function pullRequestRevised(pullRequestId: string): Promise<void> {
  const { row, fork } = await pullRequestWithFork(pullRequestId);
  const connection = await connectionOf(row.repositoryId);
  if (!connection) {
    return;
  }
  try {
    const token = await connectionToken(connection);
    if (fork && row.githubNumber && row.githubState === "open") {
      await publishBranch(row, fork, connection, token, { overwrite: true });
    }
    await dispatchWorkflowRules(row.id, connection, githubApi(token));
  } catch (err) {
    log.warning("github follow-up of a revision failed", {
      pullRequestId,
      err,
    });
  }
}

// A pull_request delivery: links the pull request on the same branch and
// carries a merge, close or reopen over. Returns the work to do after
// answering, when there is any.
export async function applyPullRequestEvent(
  connection: ConnectionRow,
  action: string,
  pull: PullPayload,
): Promise<(() => Promise<void>) | null> {
  const row = await pullRequestFor(connection, pull);
  if (!row) {
    log.info("github pull request has no counterpart", {
      connectionId: connection.id,
      githubNumber: pull.number,
    });
    return null;
  }
  await applyPullState(row, pull);
  if (!["opened", "reopened", "ready_for_review"].includes(action)) {
    return null;
  }
  return async () => {
    const api = githubApi(await connectionToken(connection));
    await dispatchWorkflowRules(row.id, connection, api);
  };
}

// A branch deleted on GitHub: the pull requests linked to it or opened from
// it close, and the branch goes from their session repositories too.
export async function branchDeletedOnGithub(
  connection: ConnectionRow,
  branch: string,
): Promise<void> {
  const rows = (
    await pullRequestsOnBranch(connection.repositoryId, branch)
  ).filter(
    (row) =>
      (row.githubNumber !== null || row.origin === "github") &&
      (row.status === "open" || row.status === "processing"),
  );
  for (const row of rows) {
    await markClosed(row.id);
    await deleteForkBranch(row.id, branch);
  }
  log.info("branch deleted on github", {
    connectionId: connection.id,
    closed: rows.length,
  });
}

// Starts the run-workflow rules the current revision matched that have not
// started yet. A workflow runs on the pull request's branch on GitHub, so
// until there is a GitHub pull request the rules wait. Prompt rules are
// judged once the revision is grouped, so nothing starts before.
export async function dispatchWorkflowRules(
  pullRequestId: string,
  connection: ConnectionRow,
  api: GithubApi,
): Promise<void> {
  const { row } = await pullRequestWithFork(pullRequestId);
  if (row.status !== "open") {
    return;
  }
  const onGithub = row.githubNumber !== null && row.githubState === "open";
  const rules = (await matchedWorkflowRules(row.id)).filter(
    (rule) => rule.dispatchStatus !== "dispatched",
  );
  for (const rule of rules) {
    await (onGithub
      ? dispatchRule(rule, row.branch, connection, api)
      : recordDispatch(rule.id, "waiting"));
  }
  log.info("workflow rules handled", {
    pullRequestId,
    rules: rules.length,
    onGithub,
  });
}

async function openOnGithub(
  row: PullRequestRow,
  connection: ConnectionRow,
  api: GithubApi,
): Promise<void> {
  const pull = await api.createPull(connection.owner, connection.repo, {
    title: row.title,
    body: row.description ?? "",
    head: row.branch,
    base: row.targetBranch,
  });
  await linkGithub(row.id, linkOf(pull));
  log.info("github pull request created", {
    pullRequestId: row.id,
    githubNumber: pull.number,
  });
}

// Merges the GitHub pull request at exactly the reviewed head.
async function mergeOnGithub(
  principal: Principal,
  row: PullRequestRow,
  connection: ConnectionRow,
  method: MergeMethod,
): Promise<void> {
  if (!row.githubNumber) {
    throw new ForgeError(
      "BAD_REQUEST",
      "Create this pull request in GitHub first: the repository is connected, so it merges there",
    );
  }
  const api = githubApi(await connectionToken(connection));
  const [title, ...body] = mergeMessage(row, method).split("\n\n");
  const result = await api.mergePull(
    connection.owner,
    connection.repo,
    row.githubNumber,
    { method, sha: row.headCommit, title: title!, message: body.join("\n\n") },
  );
  await markMerged(row.id, {
    method,
    commit: result.sha,
    by: principal.userId,
  });
  await linkGithub(row.id, {
    number: row.githubNumber,
    url: row.githubUrl ?? "",
    state: "merged",
  });
  log.info("merged on github", { pullRequestId: row.id, method });
}

async function dispatchRule(
  rule: WorkflowRuleRun,
  branch: string,
  connection: ConnectionRow,
  api: GithubApi,
): Promise<void> {
  try {
    await api.dispatchWorkflow(
      connection.owner,
      connection.repo,
      rule.workflow.id,
      branch,
    );
    await recordDispatch(rule.id, "dispatched");
  } catch (err) {
    if (!(err instanceof GithubError)) {
      throw err;
    }
    log.info("workflow dispatch refused", {
      ruleRunId: rule.id,
      code: err.code,
    });
    await recordDispatch(rule.id, "failed", err.message);
  }
}

async function deleteForkBranch(pullRequestId: string, branch: string) {
  const { fork } = await pullRequestWithFork(pullRequestId);
  if (!fork) {
    return;
  }
  const remote = await getGitHost().gitRemote(
    fork,
    "write",
    PUBLISH_TOKEN_TTL_SECONDS,
  );
  await deleteRefs(remote, [`refs/heads/${branch}`]);
}

// The GitHub pull request for this one: the linked one, read afresh, or an
// open one from the same branch into the same target, linked now.
async function currentPull(
  connection: ConnectionRow,
  api: GithubApi,
  pullRequestId: string,
): Promise<PullPayload | null> {
  const { row } = await pullRequestWithFork(pullRequestId);
  const pull = row.githubNumber
    ? await api.pull(connection.owner, connection.repo, row.githubNumber)
    : (await api.pullsFrom(connection.owner, connection.repo, row.branch)).find(
        (candidate) =>
          candidate.state === "open" &&
          candidate.base.ref === row.targetBranch &&
          sameRepository(connection, candidate),
      );
  if (pull) {
    await applyPullState(row, pull);
  }
  return pull ?? null;
}

async function applyPullState(row: PullRequestRow, pull: PullPayload) {
  const state = stateOf(pull);
  await linkGithub(row.id, linkOf(pull));
  if (state === "merged" && row.status !== "merged") {
    await markMerged(row.id, {
      method: null,
      commit: pull.merge_commit_sha,
      by: null,
    });
  } else if (state === "closed" && row.status !== "closed") {
    await markClosed(row.id);
  } else if (state === "open" && row.status === "closed") {
    await markReopened(row.id);
  }
}

// The pull request a GitHub one stands for: the one already linked to it,
// or the newest still open on the same branch into the same target.
async function pullRequestFor(
  connection: ConnectionRow,
  pull: PullPayload,
): Promise<PullRequestRow | null> {
  if (!sameRepository(connection, pull)) {
    return null;
  }
  const rows = await pullRequestsOnBranch(
    connection.repositoryId,
    pull.head.ref,
  );
  const linked = rows.find((row) => row.githubNumber === pull.number);
  const open = rows
    .filter(
      (row) =>
        row.githubNumber === null &&
        row.targetBranch === pull.base.ref &&
        (row.status === "open" || row.status === "processing"),
    )
    .at(-1);
  return linked ?? open ?? null;
}

async function publishBranch(
  row: PullRequestRow,
  fork: string,
  connection: ConnectionRow,
  token: string,
  { overwrite }: { overwrite: boolean },
): Promise<void> {
  const ref = `refs/heads/${row.branch}`;
  const github = gitRemote(token, connection.owner, connection.repo);
  if (!overwrite) {
    const existing = (await listRefs(github)).get(ref);
    if (existing && existing !== row.headCommit) {
      throw new ForgeError(
        "CONFLICT",
        `GitHub already has a branch named ${row.branch} at another commit`,
      );
    }
  }
  const source = await getGitHost().gitRemote(
    fork,
    "read",
    PUBLISH_TOKEN_TTL_SECONDS,
  );
  await copyReviewedHead(source, github, row, ref);
  log.info("branch published to github", { pullRequestId: row.id });
}

// The check runs and commit statuses on the commit. A fine-grained token
// cannot be granted the check runs (GitHub has no such permission for it), so
// then each workflow run stands in for its own.
async function checksAt(
  connection: ConnectionRow,
  api: GithubApi,
  sha: string,
  runs: WorkflowRun[],
): Promise<GithubCheck[]> {
  const [checkRuns, statuses] = await Promise.all([
    checkRunsIfAllowed(connection, api, sha),
    api.statuses(connection.owner, connection.repo, sha),
  ]);
  const checks = checkRuns
    ? checkRuns.map(fromCheckRun)
    : latestWorkflowRuns(runs).map(fromWorkflowRun);
  return [...checks, ...latestStatuses(statuses)];
}

// Null when GitHub refuses the token the check runs.
async function checkRunsIfAllowed(
  connection: ConnectionRow,
  api: GithubApi,
  sha: string,
): Promise<CheckRunPayload[] | null> {
  try {
    return await api.checkRuns(connection.owner, connection.repo, sha);
  } catch (err) {
    if (!(err instanceof GithubError && err.code === "FORBIDDEN")) {
      throw err;
    }
    log.info("check runs refused to this token", {
      connectionId: connection.id,
    });
    return null;
  }
}

// Newest first, like GitHub, so a re-run replaces the run it repeats.
function latestWorkflowRuns(runs: WorkflowRun[]): WorkflowRun[] {
  const seen = new Set<string>();
  return runs.filter((run) => {
    const key = `${run.workflowName} (${run.event})`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function fromWorkflowRun(run: WorkflowRun): GithubCheck {
  return {
    name: `${run.workflowName} (${run.event})`,
    source: "check",
    status:
      run.status === "completed" || run.status === "in_progress"
        ? run.status
        : "queued",
    conclusion: run.conclusion,
    url: run.htmlUrl,
  };
}

function fromCheckRun(run: CheckRunPayload): GithubCheck {
  return {
    name: run.app ? `${run.name} (${run.app.name})` : run.name,
    source: "check",
    status:
      run.status === "completed" || run.status === "in_progress"
        ? run.status
        : "queued",
    conclusion: run.conclusion,
    url: run.html_url ?? run.details_url,
  };
}

// GitHub lists every status posted, newest first; a context's newest is the
// one that counts.
function latestStatuses(statuses: CommitStatusPayload[]): GithubCheck[] {
  const seen = new Set<string>();
  return statuses.flatMap((status) => {
    if (seen.has(status.context)) {
      return [];
    }
    seen.add(status.context);
    return [
      {
        name: status.context,
        source: "status" as const,
        status: status.state === "pending" ? "in_progress" : "completed",
        conclusion:
          status.state === "pending"
            ? null
            : status.state === "error"
              ? "failure"
              : status.state,
        url: status.target_url,
      },
    ];
  });
}

export async function requireConnection(
  repositoryId: string,
): Promise<ConnectionRow> {
  const connection = await connectionOf(repositoryId);
  if (!connection) {
    throw new ForgeError(
      "BAD_REQUEST",
      "This repository is not connected to GitHub",
    );
  }
  return connection;
}

function pullView(pull: PullPayload): NonNullable<GithubPullStatus["pull"]> {
  return {
    number: pull.number,
    url: pull.html_url,
    state: stateOf(pull),
    draft: pull.draft,
    mergeable: pull.mergeable ?? null,
    mergeableState: pull.mergeable_state ?? null,
    headSha: pull.head.sha,
  };
}

export function linkOf(pull: PullPayload) {
  return { number: pull.number, url: pull.html_url, state: stateOf(pull) };
}

function stateOf(pull: PullPayload): "open" | "closed" | "merged" {
  return pull.merged || pull.merged_at ? "merged" : pull.state;
}

// A pull request from a fork has its branch elsewhere: it is not this one.
export function sameRepository(
  connection: ConnectionRow,
  pull: PullPayload,
): boolean {
  return (
    pull.head.repo?.full_name.toLowerCase() ===
    `${connection.owner}/${connection.repo}`.toLowerCase()
  );
}
