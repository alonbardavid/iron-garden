// Answers a reviewer's ad hoc question in chat. Runs inside the sandboxed
// Dynamic Worker, so it imports only its siblings: everything it may do is a
// method on `tools` or `repository`, RPC stubs scoped to one question.

import {
  fulfil,
  jsonObjectOf,
  MAX_READ_TURNS,
  requestsOf,
  type ChatMessage,
  type RepositoryRequest,
  type SessionRepository,
} from "./reading.js";

export interface AnswerTools {
  // The answer prompt, filled in for the question, and the question itself.
  prompt(): Promise<{ system: string; question: string }>;
  complete(messages: ChatMessage[]): Promise<string>;
}

export type AnswerOutcome =
  | { ok: true; answer: string }
  | { ok: false; error: string };

// Replies the model may give that are neither reads nor an answer.
export const MAX_INVALID_REPLIES = 3;

const NEXT = "Answer with more reads, or with your answer.";

/**
 * Asks the model to answer the question. It may first ask to list and read
 * files of the repository, for up to MAX_READ_TURNS turns; a reply that is
 * neither is shown its problem, up to MAX_INVALID_REPLIES times.
 */
export async function answerQuestion(
  tools: AnswerTools,
  repository: SessionRepository,
): Promise<AnswerOutcome> {
  const { system, question } = await tools.prompt();
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `${question}\n\nAnswer with one JSON object only: your reads, or {"answer": "<markdown>"}.`,
    },
  ];
  let readTurns = 0;
  let invalid = 0;
  let problem = "";
  while (invalid < MAX_INVALID_REPLIES) {
    const text = await tools.complete(messages);
    messages.push({ role: "assistant", content: text });
    const reply = parseAnswerReply(text, readTurns >= MAX_READ_TURNS);
    if (reply.kind === "answer") {
      return { ok: true, answer: reply.answer };
    }
    if (reply.kind === "reads") {
      readTurns++;
      messages.push({
        role: "user",
        content: await fulfil(repository, reply.requests, NEXT),
      });
      continue;
    }
    invalid++;
    problem = reply.problem;
    messages.push({
      role: "user",
      content: `${problem}. Answer with one JSON object again.`,
    });
  }
  return {
    ok: false,
    error: `The model did not answer after ${MAX_INVALID_REPLIES} tries: ${problem}`,
  };
}

type AnswerReply =
  | { kind: "answer"; answer: string }
  | { kind: "reads"; requests: RepositoryRequest[] }
  | { kind: "invalid"; problem: string };

// The model's answer, or the reads it asks for first; once its reads are
// spent, asking for more is a problem.
export function parseAnswerReply(
  text: string,
  readsSpent: boolean,
): AnswerReply {
  const value = jsonObjectOf(text);
  if (typeof value === "string") {
    return { kind: "invalid", problem: value };
  }
  if (typeof value.answer === "string" && value.answer.trim()) {
    return { kind: "answer", answer: value.answer.trim() };
  }
  if (!Array.isArray(value.requests)) {
    return {
      kind: "invalid",
      problem: 'The reply must be {"requests": [...]} or {"answer": "..."}',
    };
  }
  if (readsSpent) {
    return {
      kind: "invalid",
      problem: "You have read all you can; answer now",
    };
  }
  const requests = requestsOf(value.requests);
  return typeof requests === "string"
    ? { kind: "invalid", problem: requests }
    : { kind: "reads", requests };
}
