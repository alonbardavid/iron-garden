import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { sandboxEntrypoint, type ProcessingJob } from "@lib/ai";
import { pullRequestRevised } from "@lib/github";
import { moduleLogger, withContext } from "@lib/logging";
import {
  answerPromptFor,
  checkAnswer,
  completeForAnswer,
  completeForJob,
  groupingPromptFor,
  listForAnswer,
  listForJob,
  readForAnswer,
  readForJob,
  runAnswerJob,
  runGroupingJob,
  type AnswerJob,
  type AnswerOutcome,
  type AnswerTools,
  type ChatMessage,
  type GroupingAnswer,
  type GroupingJob,
  type GroupingOutcome,
  type GroupingTools,
  type RepositoryFile,
  type RepositoryVersion,
  type SessionRepository,
} from "@lib/review";
import sandboxCode from "virtual:processing-sandbox";

const log = moduleLogger("backend/processing");

// Retries of a thrown job (the model busy, a binding down) before the run
// that records the failure instead of throwing, and the wait before the
// first, doubling after each.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10_000;

const JOB_PREFIX = "job:";

interface Pending {
  job: ProcessingJob;
  attempts: number;
}

/**
 * One per pull request (named by its id): the jobs waiting for the server's
 * model, run from an alarm so the work outlives the request that asked for
 * it and is retried when it throws. The revision waiting to be grouped (a
 * newer one replaces it), and each ad hoc question in chat. A job runs in
 * this Worker, but the model's part runs in a Dynamic Worker with no network
 * and no bindings of its own: only the stubs below, scoped to the job.
 */
export class PullRequestProcessor extends DurableObject<Cloudflare.Env> {
  async enqueue(job: ProcessingJob): Promise<void> {
    await this.ctx.storage.put<Pending>(keyOf(job), { job, attempts: 0 });
    await this.ctx.storage.setAlarm(Date.now());
  }

  override async alarm(): Promise<void> {
    const pending = await this.ctx.storage.list<Pending>({
      prefix: JOB_PREFIX,
    });
    const failed = await Promise.all(
      [...pending.values()].map((entry) => this.runOne(entry)),
    );
    const retries = failed.filter((attempts) => attempts !== null);
    if (retries.length > 0) {
      await this.retryIn(RETRY_DELAY_MS * 2 ** (Math.min(...retries) - 1));
    }
  }

  // Runs one job and forgets it, or counts the attempt when it threw; the
  // attempts it has had then, null when it is done.
  private async runOne({ job, attempts }: Pending): Promise<number | null> {
    const ran = await withContext(contextOf(job), () =>
      this.run(job, attempts),
    );
    const key = keyOf(job);
    const waiting = await this.ctx.storage.get<Pending>(key);
    // A job queued again while this one ran replaces it, and is not touched.
    if (!waiting || !sameJob(waiting.job, job)) {
      return null;
    }
    if (ran) {
      await this.ctx.storage.delete(key);
      return null;
    }
    await this.ctx.storage.put<Pending>(key, { job, attempts: attempts + 1 });
    return attempts + 1;
  }

  // Whether the job is done; false when it threw and is to be retried.
  private async run(job: ProcessingJob, attempts: number): Promise<boolean> {
    log.info("processing job started", {
      kind: job.kind,
      attempt: attempts + 1,
    });
    const lastAttempt = attempts >= MAX_RETRIES;
    try {
      if (job.kind === "group-pull-request") {
        await this.group(job, lastAttempt);
      } else {
        await this.answer(job, lastAttempt);
      }
      return true;
    } catch (err) {
      log.warning("processing job failed; will retry", { kind: job.kind, err });
      return false;
    }
  }

  private async group(job: GroupingJob, lastAttempt: boolean): Promise<void> {
    const grouping = {
      pullRequestId: job.pullRequestId,
      revision: job.revision,
    };
    const exports = this.exports();
    const opened = await runGroupingJob(
      grouping,
      () =>
        sandboxEntrypoint<Sandbox>(sandboxCode).group(
          exports.GroupingToolsEntrypoint({ props: grouping }),
          exports.SessionRepositoryEntrypoint({ props: grouping }),
        ),
      { lastAttempt },
    );
    // Like an agent's groups: a connected repository's GitHub branch and
    // workflow rules follow the revision now that it is open.
    if (opened) {
      await pullRequestRevised(job.pullRequestId);
    }
  }

  private async answer(job: AnswerJob, lastAttempt: boolean): Promise<void> {
    const question = {
      pullRequestId: job.pullRequestId,
      messageId: job.messageId,
    };
    const exports = this.exports();
    await runAnswerJob(
      question,
      () =>
        sandboxEntrypoint<Sandbox>(sandboxCode).answer(
          exports.AnswerToolsEntrypoint({ props: question }),
          exports.AnswerRepositoryEntrypoint({ props: question }),
        ),
      { lastAttempt },
    );
  }

  // Keeps an alarm already due, such as one a job queued while this ran.
  private async retryIn(ms: number): Promise<void> {
    const at = Date.now() + ms;
    const scheduled = await this.ctx.storage.getAlarm();
    if (scheduled === null || scheduled > at) {
      await this.ctx.storage.setAlarm(at);
    }
  }

  // ctx.exports: loopback stubs of this Worker's own entrypoints.
  private exports(): Exports {
    return (this.ctx as unknown as { exports: Exports }).exports;
  }
}

// One revision waits to be grouped at a time; every question waits apart.
function keyOf(job: ProcessingJob): string {
  return job.kind === "group-pull-request"
    ? `${JOB_PREFIX}group`
    : `${JOB_PREFIX}answer:${job.messageId}`;
}

function sameJob(a: ProcessingJob, b: ProcessingJob): boolean {
  return a.kind === "group-pull-request" && b.kind === "group-pull-request"
    ? a.revision === b.revision
    : keyOf(a) === keyOf(b);
}

function contextOf(job: ProcessingJob): Record<string, unknown> {
  return job.kind === "group-pull-request"
    ? { pullRequestId: job.pullRequestId, revision: job.revision }
    : { pullRequestId: job.pullRequestId, messageId: job.messageId };
}

/**
 * What the processing sandbox may do, handed to it as an RPC stub. Its props
 * are set here, by the host, so a sandbox can only ever reach the one pull
 * request revision its job names.
 */
export class GroupingToolsEntrypoint
  extends WorkerEntrypoint<Cloudflare.Env, GroupingJob>
  implements GroupingTools
{
  prompt(): Promise<string> {
    return groupingPromptFor(this.ctx.props);
  }

  complete(messages: ChatMessage[]): Promise<string> {
    return completeForJob(this.ctx.props, messages);
  }

  check(answer: GroupingAnswer): Promise<string[]> {
    return checkAnswer(this.ctx.props, answer);
  }
}

/**
 * The sandbox's access to Artifacts. A Dynamic Worker cannot be handed the
 * ARTIFACTS binding itself, so it gets this instead: the job's session
 * repository, read-only, at the pull request's base and head commits only.
 */
export class SessionRepositoryEntrypoint
  extends WorkerEntrypoint<Cloudflare.Env, GroupingJob>
  implements SessionRepository
{
  list(
    version: RepositoryVersion,
    directory: string,
  ): Promise<{ paths: string[]; truncated: boolean }> {
    return listForJob(this.ctx.props, version, directory);
  }

  read(
    version: RepositoryVersion,
    path: string,
  ): Promise<RepositoryFile | null> {
    return readForJob(this.ctx.props, version, path);
  }
}

/**
 * What an answering sandbox may do: its prompt and the model, for the one
 * question its job names.
 */
export class AnswerToolsEntrypoint
  extends WorkerEntrypoint<Cloudflare.Env, AnswerJob>
  implements AnswerTools
{
  prompt(): Promise<{ system: string; question: string }> {
    return answerPromptFor(this.ctx.props);
  }

  complete(messages: ChatMessage[]): Promise<string> {
    return completeForAnswer(this.ctx.props, messages);
  }
}

// An answering sandbox's read-only access to the pull request's commits.
export class AnswerRepositoryEntrypoint
  extends WorkerEntrypoint<Cloudflare.Env, AnswerJob>
  implements SessionRepository
{
  list(
    version: RepositoryVersion,
    directory: string,
  ): Promise<{ paths: string[]; truncated: boolean }> {
    return listForAnswer(this.ctx.props, version, directory);
  }

  read(
    version: RepositoryVersion,
    path: string,
  ): Promise<RepositoryFile | null> {
    return readForAnswer(this.ctx.props, version, path);
  }
}

interface Sandbox {
  group(
    tools: GroupingTools,
    repository: SessionRepository,
  ): Promise<GroupingOutcome>;
  answer(
    tools: AnswerTools,
    repository: SessionRepository,
  ): Promise<AnswerOutcome>;
}

// ctx.exports: loopback stubs of this Worker's own entrypoints.
interface Exports {
  GroupingToolsEntrypoint(options: { props: GroupingJob }): GroupingTools;
  SessionRepositoryEntrypoint(options: {
    props: GroupingJob;
  }): SessionRepository;
  AnswerToolsEntrypoint(options: { props: AnswerJob }): AnswerTools;
  AnswerRepositoryEntrypoint(options: { props: AnswerJob }): SessionRepository;
}
