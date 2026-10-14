import { describe, expect, it } from "vitest";
import {
  answerQuestion,
  MAX_INVALID_REPLIES,
  parseAnswerReply,
  type AnswerTools,
} from "./answerer";
import type { ChatMessage, SessionRepository } from "./reading";

const REPOSITORY: SessionRepository = {
  list: async () => ({ paths: [], truncated: false }),
  read: async () => ({
    kind: "text",
    text: "export const a = 1;\n",
    lines: 1,
    truncated: false,
  }),
};

function tools(replies: string[]) {
  const asked: ChatMessage[][] = [];
  const fake: AnswerTools = {
    prompt: async () => ({ system: "About #1", question: "Why?" }),
    complete: async (messages) => {
      asked.push([...messages]);
      return replies[asked.length - 1] ?? "{}";
    },
  };
  return { fake, asked };
}

describe("answerQuestion", () => {
  it("answers with what the model says, after its reads", async () => {
    const { fake, asked } = tools([
      JSON.stringify({ requests: [{ read: "src/a.ts", at: "base" }] }),
      JSON.stringify({ answer: "Because `a` was **1**." }),
    ]);
    expect(await answerQuestion(fake, REPOSITORY)).toEqual({
      ok: true,
      answer: "Because `a` was **1**.",
    });
    expect(asked[0]![0]).toEqual({ role: "system", content: "About #1" });
    expect(asked[0]![1]!.content).toContain("Why?");
    expect(asked[1]!.at(-1)!.content).toContain(
      "### src/a.ts at base (1 lines)",
    );
  });

  it("gives up after replies that are neither", async () => {
    const { fake } = tools([]);
    expect(await answerQuestion(fake, REPOSITORY)).toMatchObject({
      ok: false,
    });
  });

  it("shows the model what was wrong", async () => {
    const { fake, asked } = tools([
      "no json",
      JSON.stringify({ answer: "Ok" }),
    ]);
    expect(await answerQuestion(fake, REPOSITORY)).toEqual({
      ok: true,
      answer: "Ok",
    });
    expect(asked[1]!.at(-1)!.content).toContain("has no JSON object");
    expect(MAX_INVALID_REPLIES).toBeGreaterThan(1);
  });
});

describe("parseAnswerReply", () => {
  it("refuses more reads once they are spent", () => {
    expect(
      parseAnswerReply('{"requests": [{"read": "a.ts"}]}', true),
    ).toMatchObject({ kind: "invalid" });
  });

  it("refuses an empty answer", () => {
    expect(parseAnswerReply('{"answer": "  "}', false)).toMatchObject({
      kind: "invalid",
    });
  });
});
