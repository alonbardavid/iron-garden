import {
  agentSessions,
  and,
  eq,
  getDb,
  pullRequestFiles,
  pullRequests,
  repositories,
} from "@lib/db-models";
import {
  completeJson,
  getAgentConfig,
  type ChatMessage,
  type GroupPullRequestJob,
} from "@lib/ai";
import { groupingAnswerSchema } from "@lib/contract";
import { moduleLogger } from "@lib/logging";
import { readContents } from "../files";
import { fillGroupingPrompt } from "../fill-prompt";
import type { PullRequestRow } from "../lookup";
import { groupingProblems, storeGroups } from "../pull-requests";
import { repositoryJoin, sessionJoin, storageName } from "../storage";
import { renderChanges } from "./changes";
import { transcriptsText } from "./made";
import type { GroupingAnswer, GroupingOutcome } from "./sandbox/processor";

const log = moduleLogger("review/processing/jobs");

// Characters of diff the prompt carries; past it, files are listed unshown.
const MAX_DIFF_CHARS = 400_000;

export type GroupingJob = Pick<
  GroupPullRequestJob,
  "pullRequestId" | "revision"
>;

/**
 * Runs one queued grouping job: `group` runs the model in the sandbox. A job
 * for a revision that is no longer processing is skipped. When the model
 * cannot give a valid answer, the pull request opens without groups and says
 * why. Anything thrown (the model busy, a binding down) is rethrown so the
 * job is retried, until `lastAttempt`, when it is recorded the same way.
 * Returns whether the pull request opened.
 */
export async function runGroupingJob(
  job: GroupingJob,
  group: () => Promise<GroupingOutcome>,
  { lastAttempt }: { lastAttempt: boolean },
): Promise<boolean> {
  if (!(await currentRevision(job))) {
    log.info("grouping job skipped: revision no longer processing", { ...job });
    return false;
  }
  let outcome: GroupingOutcome;
  try {
    outcome = await group();
  } catch (err) {
    if (!lastAttempt) {
      throw err;
    }
    outcome = { ok: false, error: errorMessage(err), attempts: 0 };
  }
  if (outcome.ok) {
    await storeAnswer(job, outcome.answer);
  } else {
    await openUngrouped(job, outcome.error);
  }
  return true;
}

// The tools a sandboxed processor gets, each scoped to one job.

export async function groupingPromptFor(job: GroupingJob): Promise<string> {
  const loaded = await currentRevision(job);
  if (!loaded) {
    throw new Error("This revision is no longer processing");
  }
  const { row, artifactsName, repositoryName } = loaded;
  const files = await getDb()
    .select()
    .from(pullRequestFiles)
    .where(eq(pullRequestFiles.pullRequestId, row.id))
    .orderBy(pullRequestFiles.path);
  const [contents, made] = await Promise.all([
    readContents(artifactsName, row, files),
    transcriptsText(row),
  ]);
  const changes = renderChanges(
    contents.map((content, i) => ({ ...content, change: files[i]!.change })),
    MAX_DIFF_CHARS,
  );
  log.info("grouping prompt built", {
    ...job,
    files: files.length,
    diffChars: changes.length,
    transcripts: made.count,
  });
  return fillGroupingPrompt(
    "server",
    repositoryName,
    { ...row, files },
    { changes, transcripts: made.text },
  );
}

export async function completeForJob(
  job: GroupingJob,
  messages: ChatMessage[],
): Promise<string> {
  const config = await getAgentConfig();
  log.info("asking the model to group", {
    ...job,
    model: config.model,
    turn: messages.length,
  });
  return completeJson(config, messages);
}

export async function checkAnswer(
  job: GroupingJob,
  answer: GroupingAnswer,
): Promise<string[]> {
  const loaded = await currentRevision(job);
  if (!loaded) {
    return ["This revision is no longer processing"];
  }
  const parsed = groupingAnswerSchema.safeParse(answer);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "answer"}: ${issue.message}`,
    );
  }
  const problems = await groupingProblems(
    loaded.row,
    loaded,
    parsed.data.groups,
    parsed.data.rules ?? [],
  );
  log.info("model answer checked", { ...job, problems: problems.length });
  return problems;
}

// The sandbox's answer is checked again here: nothing it returns is trusted.
async function storeAnswer(
  job: GroupingJob,
  answer: GroupingAnswer,
): Promise<void> {
  const loaded = await currentRevision(job);
  if (!loaded) {
    log.info("grouping answer dropped: revision no longer processing", {
      ...job,
    });
    return;
  }
  const parsed = groupingAnswerSchema.safeParse(answer);
  const { groups, rules = [] } = parsed.success
    ? parsed.data
    : { groups: [], rules: [] };
  const problems = parsed.success
    ? await groupingProblems(loaded.row, loaded, groups, rules)
    : ["The answer does not have the shape of groups"];
  if (problems.length > 0) {
    await openUngrouped(job, problems.join("; "));
    return;
  }
  await storeGroups(loaded.row, groups, rules);
}

// Opens the revision for review without groups, if it is still waiting.
async function openUngrouped(job: GroupingJob, error: string): Promise<void> {
  await getDb()
    .update(pullRequests)
    .set({ status: "open", processingError: error, updatedAt: new Date() })
    .where(
      and(
        eq(pullRequests.id, job.pullRequestId),
        eq(pullRequests.revision, job.revision),
        eq(pullRequests.status, "processing"),
      ),
    );
  log.warning("server grouping failed; opened without groups", {
    ...job,
    error,
  });
}

// The pull request with what reading it needs, while the job's revision is
// still the one waiting for the server to group it and its commits can be
// read.
export async function currentRevision(job: GroupingJob): Promise<{
  row: PullRequestRow;
  artifactsName: string;
  repositoryName: string;
} | null> {
  const [loaded] = await getDb()
    .select({
      row: pullRequests,
      artifactsName: storageName,
      repositoryName: repositories.name,
    })
    .from(pullRequests)
    .leftJoin(agentSessions, sessionJoin)
    .innerJoin(repositories, repositoryJoin)
    .where(eq(pullRequests.id, job.pullRequestId));
  const current =
    loaded?.row.revision === job.revision &&
    loaded.row.status === "processing" &&
    loaded.row.groupedBy === "server";
  return current && loaded.artifactsName
    ? { ...loaded, artifactsName: loaded.artifactsName }
    : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
