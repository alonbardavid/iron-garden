import {
  getDb,
  githubWorkflowRuns,
  newEntityId,
  and,
  desc,
  eq,
  sql,
} from "@lib/db-models";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { GithubError, type GithubApi } from "./api";
import { connectedApi } from "./connections";
import type {
  ArtifactPayload,
  JobPayload,
  WorkflowRunPayload,
} from "./payloads";
import type { ConnectionRow } from "./sync";

const log = moduleLogger("github/runs");

// How many of the newest runs a full sync reads.
const REFRESHED_RUNS = 50;

export interface WorkflowRun {
  runId: number;
  workflowName: string;
  runNumber: number;
  runAttempt: number;
  event: string;
  headBranch: string | null;
  headSha: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  startedAt: number;
  updatedAt: number;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: number | null;
  completedAt: number | null;
  htmlUrl: string | null;
  steps: {
    number: number;
    name: string;
    status: string;
    conclusion: string | null;
  }[];
}

export interface WorkflowArtifact {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  createdAt: number | null;
  expiresAt: number | null;
}

// The runs GitHub reported for the repository, newest first: kept as webhooks
// and syncs deliver them, so a list never waits on GitHub.
export async function listWorkflowRuns(
  principal: Principal,
  name: string,
  filter: { sha?: string; branch?: string; limit: number },
): Promise<WorkflowRun[]> {
  const { repository } = await connectedApi(principal, name, "read");
  return storedRuns(repository.id, filter);
}

// The runs on one commit, for a pull request whose head it is.
export function runsAt(
  repositoryId: string,
  sha: string,
): Promise<WorkflowRun[]> {
  return storedRuns(repositoryId, { sha, limit: 100 });
}

// The runs on a commit as GitHub has them now, kept like delivered ones, so
// they show before (or without) a webhook. When GitHub cannot be read, the
// runs already stored stand.
export async function refreshRunsAt(
  connection: ConnectionRow,
  api: GithubApi,
  sha: string,
): Promise<WorkflowRun[]> {
  try {
    const runs = await api.workflowRunsAt(
      connection.owner,
      connection.repo,
      sha,
    );
    for (const run of runs) {
      await recordRun(connection.repositoryId, run);
    }
    log.info("workflow runs at commit refreshed", {
      connectionId: connection.id,
      runs: runs.length,
    });
  } catch (err) {
    if (!(err instanceof GithubError)) {
      throw err;
    }
    log.warning("workflow runs at commit not refreshed", {
      connectionId: connection.id,
      reason: err.code,
    });
  }
  return runsAt(connection.repositoryId, sha);
}

async function storedRuns(
  repositoryId: string,
  filter: { sha?: string; branch?: string; limit: number },
): Promise<WorkflowRun[]> {
  const rows = await getDb()
    .select()
    .from(githubWorkflowRuns)
    .where(
      and(
        eq(githubWorkflowRuns.repositoryId, repositoryId),
        filter.sha ? eq(githubWorkflowRuns.headSha, filter.sha) : undefined,
        filter.branch
          ? eq(githubWorkflowRuns.headBranch, filter.branch)
          : undefined,
      ),
    )
    .orderBy(desc(githubWorkflowRuns.startedAt))
    .limit(filter.limit);
  return rows.map(toRun);
}

export async function listWorkflowJobs(
  principal: Principal,
  name: string,
  runId: number,
): Promise<WorkflowJob[]> {
  const { connection, api } = await connectedApi(principal, name, "read");
  const jobs = await api.jobs(connection.owner, connection.repo, runId);
  log.info("workflow jobs read", { connectionId: connection.id, runId });
  return jobs.map(toJob);
}

export async function listWorkflowArtifacts(
  principal: Principal,
  name: string,
  runId: number,
): Promise<WorkflowArtifact[]> {
  const { connection, api } = await connectedApi(principal, name, "read");
  const artifacts = await api.artifacts(
    connection.owner,
    connection.repo,
    runId,
  );
  log.info("workflow artifacts read", { connectionId: connection.id, runId });
  return artifacts.map(toArtifact);
}

// A short-lived URL the caller downloads the artifact's zip from. GitHub
// only issues it for the connected repository's own artifacts.
export async function artifactDownloadUrl(
  principal: Principal,
  name: string,
  artifactId: number,
): Promise<string> {
  const { connection, api } = await connectedApi(principal, name, "read");
  log.info("artifact download issued", {
    connectionId: connection.id,
    artifactId,
  });
  return api.artifactDownloadUrl(connection.owner, connection.repo, artifactId);
}

export async function jobLogsUrl(
  principal: Principal,
  name: string,
  jobId: number,
): Promise<string> {
  const { connection, api } = await connectedApi(principal, name, "read");
  log.info("job logs issued", { connectionId: connection.id, jobId });
  return api.jobLogsUrl(connection.owner, connection.repo, jobId);
}

export async function refreshRuns(
  connection: ConnectionRow,
  api: GithubApi,
): Promise<void> {
  const runs = await api.workflowRuns(
    connection.owner,
    connection.repo,
    REFRESHED_RUNS,
  );
  for (const run of runs) {
    await recordRun(connection.repositoryId, run);
  }
  log.info("workflow runs refreshed", {
    connectionId: connection.id,
    runs: runs.length,
  });
}

// Keeps the newest report of a run: a delivery that arrives late (or is
// replayed) never rolls it back.
export async function recordRun(
  repositoryId: string,
  run: WorkflowRunPayload,
): Promise<void> {
  const values = {
    workflowName: run.name ?? "Workflow",
    runNumber: run.run_number,
    runAttempt: run.run_attempt,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    status: run.status ?? "queued",
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    startedAt: new Date(run.run_started_at ?? run.created_at),
    githubUpdatedAt: new Date(run.updated_at),
  };
  await getDb()
    .insert(githubWorkflowRuns)
    .values({
      id: newEntityId("GITHUB_WORKFLOW_RUN"),
      repositoryId,
      runId: run.id,
      ...values,
    })
    .onConflictDoUpdate({
      target: [githubWorkflowRuns.repositoryId, githubWorkflowRuns.runId],
      set: { ...values, updatedAt: new Date() },
      setWhere: sql`excluded.github_updated_at >= ${githubWorkflowRuns.githubUpdatedAt}`,
    });
}

function toRun(row: typeof githubWorkflowRuns.$inferSelect): WorkflowRun {
  return {
    runId: row.runId,
    workflowName: row.workflowName,
    runNumber: row.runNumber,
    runAttempt: row.runAttempt,
    event: row.event,
    headBranch: row.headBranch,
    headSha: row.headSha,
    status: row.status,
    conclusion: row.conclusion,
    htmlUrl: row.htmlUrl,
    startedAt: row.startedAt.getTime(),
    updatedAt: row.githubUpdatedAt.getTime(),
  };
}

function toJob(job: JobPayload): WorkflowJob {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: epoch(job.started_at),
    completedAt: epoch(job.completed_at),
    htmlUrl: job.html_url,
    steps: job.steps,
  };
}

function toArtifact(artifact: ArtifactPayload): WorkflowArtifact {
  return {
    id: artifact.id,
    name: artifact.name,
    sizeInBytes: artifact.size_in_bytes,
    expired: artifact.expired,
    createdAt: epoch(artifact.created_at),
    expiresAt: epoch(artifact.expires_at),
  };
}

function epoch(iso: string | null): number | null {
  return iso ? Date.parse(iso) : null;
}
