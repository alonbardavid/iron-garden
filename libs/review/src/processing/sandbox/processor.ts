// Runs inside the sandboxed Dynamic Worker, so it imports nothing at runtime:
// everything it may do is a method on `tools` or `repository`, RPC stubs the
// host scoped to one pull request revision.

import {
  fulfil,
  jsonObjectOf,
  MAX_READ_TURNS,
  requestsOf,
  type ChatMessage,
  type RepositoryRequest,
  type SessionRepository,
} from "./reading.js";

export type {
  ChatMessage,
  RepositoryFile,
  RepositoryVersion,
  SessionRepository,
} from "./reading.js";
export { MAX_READ_TURNS, MAX_REQUESTS_PER_TURN } from "./reading.js";

export interface GroupingAnswer {
  groups: unknown[];
  rules: unknown[];
}

export interface GroupingTools {
  // The server grouping prompt, filled in for this pull request.
  prompt(): Promise<string>;
  complete(messages: ChatMessage[]): Promise<string>;
  // What is wrong with an answer, phrased for the model; empty when nothing.
  check(answer: GroupingAnswer): Promise<string[]>;
}

export type GroupingOutcome =
  | { ok: true; answer: GroupingAnswer; attempts: number }
  | { ok: false; error: string; attempts: number };

// Answers with groups the model may give before giving up.
export const MAX_ATTEMPTS = 3;

const NEXT = "Answer with more reads, or with your groups.";

/**
 * Asks the model for groups. It may first ask to list and read files of the
 * repository, for up to MAX_READ_TURNS turns. While its groups have problems,
 * it is shown them and asked again, up to MAX_ATTEMPTS answers.
 */
export async function groupPullRequest(
  tools: GroupingTools,
  repository: SessionRepository,
): Promise<GroupingOutcome> {
  const messages: ChatMessage[] = [
    { role: "system", content: await tools.prompt() },
    {
      role: "user",
      content:
        "Group this pull request. Answer with one JSON object only: your reads, or your groups.",
    },
  ];
  let attempts = 0;
  let readTurns = 0;
  let problems: string[] = [];
  while (attempts < MAX_ATTEMPTS) {
    const text = await tools.complete(messages);
    messages.push({ role: "assistant", content: text });
    const reply = withinReadBudget(parseReply(text), readTurns);
    if (reply.kind === "reads") {
      readTurns++;
      messages.push({
        role: "user",
        content: await fulfil(repository, reply.requests, NEXT),
      });
      continue;
    }
    attempts++;
    problems =
      reply.kind === "answer"
        ? await tools.check(reply.answer)
        : [reply.problem];
    if (reply.kind === "answer" && problems.length === 0) {
      return { ok: true, answer: reply.answer, attempts };
    }
    messages.push({ role: "user", content: retryRequest(problems) });
  }
  return {
    ok: false,
    error: `The model's answer still had problems after ${MAX_ATTEMPTS} tries: ${problems.join("; ")}`,
    attempts,
  };
}

type Reply =
  | { kind: "answer"; answer: GroupingAnswer }
  | { kind: "reads"; requests: RepositoryRequest[] }
  | { kind: "invalid"; problem: string };

// The JSON object in a model's reply, which may come wrapped in a code fence
// or a sentence despite being asked not to: its groups, or what it wants to
// read first.
export function parseReply(text: string): Reply {
  const value = jsonObjectOf(text);
  if (typeof value === "string") {
    return { kind: "invalid", problem: value };
  }
  if (Array.isArray(value.requests) && !("groups" in value)) {
    const requests = requestsOf(value.requests);
    return typeof requests === "string"
      ? { kind: "invalid", problem: requests }
      : { kind: "reads", requests };
  }
  const { groups, rules = [] } = value;
  if (!Array.isArray(groups) || !Array.isArray(rules)) {
    return {
      kind: "invalid",
      problem: 'The answer must be an object with a "groups" array',
    };
  }
  return { kind: "answer", answer: { groups, rules } };
}

// Reads past MAX_READ_TURNS count as an answer with a problem, so a model
// that keeps reading still runs out of attempts.
function withinReadBudget(reply: Reply, readTurns: number): Reply {
  return reply.kind === "reads" && readTurns >= MAX_READ_TURNS
    ? {
        kind: "invalid",
        problem: "You have read all you can; answer with your groups now",
      }
    : reply;
}

function retryRequest(problems: string[]): string {
  return `Your answer has these problems:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nFix them and answer with the whole JSON object again.`;
}
