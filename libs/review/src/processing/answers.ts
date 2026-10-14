import {
  and,
  agentSessions,
  chatChannels,
  chatMessages,
  eq,
  getDb,
  isNull,
  newEntityId,
  pullRequestFiles,
  pullRequestGroups,
  pullRequests,
  repositories,
  type FileChange,
} from "@lib/db-models";
import { completeJson, getAgentConfig, type ChatMessage } from "@lib/ai";
import { requireGit } from "@lib/forge";
import { getUserProfiles } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { readContents } from "../files";
import { repositoryJoin, sessionJoin, storageName } from "../storage";
import { answerPrompt, questionText } from "./answer-prompt";
import { renderChanges } from "./changes";
import { transcriptsText } from "./made";
import { listAt, readAt, type CommitOf } from "./repository";
import type { AnswerOutcome } from "./sandbox/answerer";
import type { RepositoryFile, RepositoryVersion } from "./sandbox/reading";

const log = moduleLogger("review/processing/answers");

// What an answer's prompt carries: less diff than grouping, since a question
// is narrower and the model can read more.
const MAX_DIFF_CHARS = 200_000; // The most of the person's thread so far the prompt carries.
const MAX_CONVERSATION_CHARS = 80_000;

// A reviewer's question on a pull request's ad hoc chat channel.
export interface AnswerJob {
  pullRequestId: string;
  messageId: string;
}

type MessageRow = typeof chatMessages.$inferSelect;
type PullRequestRow = typeof pullRequests.$inferSelect;

interface LoadedQuestion {
  message: MessageRow;
  pr: PullRequestRow;
  repositoryName: string;
  // Where the pull request's commits are; null once its session is gone.
  artifactsName: string | null;
}

/**
 * Answers one question in chat: `answer` runs the model in the sandbox. The
 * reviewer sees it picked up at once, and gets the answer, or why there is
 * none, as a reply. A question deleted meanwhile is skipped. Anything thrown
 * is rethrown so the job is retried, until `lastAttempt`.
 */
export async function runAnswerJob(
  job: AnswerJob,
  answer: () => Promise<AnswerOutcome>,
  { lastAttempt }: { lastAttempt: boolean },
): Promise<void> {
  const question = await loadQuestion(job);
  if (!question) {
    log.info("answer job skipped: question gone", { ...job });
    return;
  }
  await markPickedUp(question.message);
  let outcome: AnswerOutcome;
  try {
    outcome = await answer();
  } catch (err) {
    if (!lastAttempt) {
      throw err;
    }
    outcome = { ok: false, error: errorMessage(err) };
  }
  await reply(
    question.message,
    outcome.ok ? outcome.answer : `I could not answer this. ${outcome.error}`,
  );
  log.info("ad hoc question answered", { ...job, ok: outcome.ok });
}

// The tools an answering sandbox gets, each scoped to one question.

export async function answerPromptFor(
  job: AnswerJob,
): Promise<{ system: string; question: string }> {
  const question = await requireQuestion(job);
  const { pr, message } = question;
  const db = getDb();
  const [files, groups, thread, made] = await Promise.all([
    db
      .select()
      .from(pullRequestFiles)
      .where(eq(pullRequestFiles.pullRequestId, pr.id))
      .orderBy(pullRequestFiles.path),
    db
      .select()
      .from(pullRequestGroups)
      .where(eq(pullRequestGroups.pullRequestId, pr.id))
      .orderBy(pullRequestGroups.position),
    db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.channelId, message.channelId),
          eq(chatMessages.userId, message.userId),
        ),
      )
      .orderBy(chatMessages.createdAt),
    transcriptsText(pr),
  ]);
  const changes = await diffFor(question, files);
  const earlier = thread.filter(
    (m) => m.createdAt.getTime() < message.createdAt.getTime(),
  );
  const people = await getUserProfiles([message.userId]);
  const system = answerPrompt({
    repository: question.repositoryName,
    pullRequest: pr,
    changedFiles: files.map((f) => `- ${f.path} (${f.change})`).join("\n"),
    groups,
    transcripts: made.text,
    changes,
    conversation: earlier,
    maxConversationChars: MAX_CONVERSATION_CHARS,
  });
  log.info("answer prompt built", {
    ...job,
    files: files.length,
    groups: groups.length,
    transcripts: made.count,
    earlier: earlier.length,
  });
  return {
    system,
    question: questionText({
      author: people.get(message.userId)?.name ?? "A reviewer",
      body: message.body,
      context: message.context ?? null,
      groupTitle: groups.find((g) => g.id === message.context?.group)?.title,
    }),
  };
}

// The diff, or why it cannot be read: the groups, transcripts and the
// model's own reads may still answer the question.
async function diffFor(
  { pr, artifactsName }: LoadedQuestion,
  files: { path: string; change: FileChange }[],
): Promise<string> {
  if (!artifactsName) {
    return "(the change's commits can no longer be read)";
  }
  try {
    const contents = await readContents(artifactsName, pr, files);
    return renderChanges(
      contents.map((content, i) => ({ ...content, change: files[i]!.change })),
      MAX_DIFF_CHARS,
    );
  } catch (err) {
    log.warning("answer prompt without the diff", {
      pullRequestId: pr.id,
      err,
    });
    return `(the diff could not be read: ${errorMessage(err)})`;
  }
}

export async function completeForAnswer(
  job: AnswerJob,
  messages: ChatMessage[],
): Promise<string> {
  const config = await getAgentConfig();
  log.info("asking the model to answer", {
    ...job,
    model: config.model,
    turn: messages.length,
  });
  return completeJson(config, messages);
}

export function listForAnswer(
  job: AnswerJob,
  version: RepositoryVersion,
  directory: string,
): Promise<{ paths: string[]; truncated: boolean }> {
  return listAt(commitForAnswer(job), version, directory, { ...job });
}

export function readForAnswer(
  job: AnswerJob,
  version: RepositoryVersion,
  path: string,
): Promise<RepositoryFile | null> {
  return readAt(commitForAnswer(job), version, path, { ...job });
}

// The pull request's commits as they are now, whatever its status.
function commitForAnswer(job: AnswerJob): CommitOf {
  return async (version) => {
    const { pr, artifactsName } = await requireQuestion(job);
    if (!artifactsName) {
      throw new Error("The pull request's commits can no longer be read");
    }
    requireGit();
    const commit = version === "base" ? pr.baseCommit : pr.headCommit;
    return { artifactsName, commit: commit || null };
  };
}

async function requireQuestion(job: AnswerJob): Promise<LoadedQuestion> {
  const question = await loadQuestion(job);
  if (!question) {
    throw new Error("The question was deleted");
  }
  return question;
}

// The person's message on the pull request's ad hoc channel.
async function loadQuestion(job: AnswerJob): Promise<LoadedQuestion | null> {
  const [found] = await getDb()
    .select({
      message: chatMessages,
      pr: pullRequests,
      repositoryName: repositories.name,
      artifactsName: storageName,
    })
    .from(chatMessages)
    .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
    .innerJoin(pullRequests, eq(pullRequests.id, chatChannels.pullRequestId))
    .innerJoin(repositories, repositoryJoin)
    .leftJoin(agentSessions, sessionJoin)
    .where(
      and(
        eq(chatMessages.id, job.messageId),
        eq(chatMessages.sender, "person"),
        eq(chatChannels.pullRequestId, job.pullRequestId),
        isNull(chatChannels.agentId),
      ),
    );
  return found ?? null;
}

// Delivered and being worked on, as an agent's message shows it.
async function markPickedUp(message: MessageRow): Promise<void> {
  const now = new Date();
  await getDb()
    .update(chatMessages)
    .set({ deliveredAt: message.deliveredAt ?? now, workingAt: now })
    .where(eq(chatMessages.id, message.id));
}

async function reply(question: MessageRow, body: string): Promise<void> {
  await getDb()
    .insert(chatMessages)
    .values({
      id: newEntityId("CHAT_MESSAGE"),
      channelId: question.channelId,
      userId: question.userId,
      sender: "agent",
      body,
      deliveredAt: new Date(),
    });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
