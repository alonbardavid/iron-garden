import { env } from "cloudflare:workers";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("ai/jobs");

// Work the server does after the request that asked for it has returned.
// A job names a revision, so one queued for a revision since replaced is
// skipped.
export interface GroupPullRequestJob {
  kind: "group-pull-request";
  pullRequestId: string;
  revision: number;
}

// A reviewer's question on a pull request's ad hoc chat, for the server's
// model to answer.
export interface AnswerChatJob {
  kind: "answer-chat";
  pullRequestId: string;
  messageId: string;
}

export type ProcessingJob = GroupPullRequestJob | AnswerChatJob;

// The PROCESSING Durable Object namespace, as far as queuing goes: one object
// per pull request runs its jobs (PullRequestProcessor in apps/backend).
interface JobRunners {
  getByName(name: string): { enqueue(job: ProcessingJob): Promise<void> };
}

export async function enqueueJob(job: ProcessingJob): Promise<void> {
  const runners = (env as unknown as { PROCESSING?: JobRunners }).PROCESSING;
  if (!runners) {
    throw new Error("Server-side processing is not bound on this deployment");
  }
  await runners.getByName(job.pullRequestId).enqueue(job);
  log.info("job queued", { ...job });
}
