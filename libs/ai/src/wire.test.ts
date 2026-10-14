import { describe, expect, it } from "vitest";
import { answerText, requestBody, type ChatMessage } from "./wire";

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "Group this pull request." },
  { role: "user", content: "Answer with JSON." },
  { role: "assistant", content: '{"requests": []}' },
];

describe("requestBody", () => {
  it("asks a Workers AI model for JSON with the whole conversation", () => {
    expect(requestBody("@cf/zai-org/glm-5.3-flash", MESSAGES, 100)).toEqual({
      messages: MESSAGES,
      max_tokens: 100,
      response_format: { type: "json_object" },
    });
  });

  it("gives Claude the system prompt apart from the turns", () => {
    expect(requestBody("anthropic/claude-sonnet-5.5", MESSAGES, 100)).toEqual({
      system: "Group this pull request.",
      messages: MESSAGES.slice(1),
      max_tokens: 100,
    });
  });
});

describe("answerText", () => {
  it("reads Workers AI's response, parsed or not", () => {
    expect(answerText({ response: '{"ok":true}' })).toBe('{"ok":true}');
    expect(answerText({ response: { ok: true } })).toBe('{"ok":true}');
  });

  it("reads the OpenAI shape", () => {
    expect(
      answerText({ choices: [{ message: { content: '{"ok":true}' } }] }),
    ).toBe('{"ok":true}');
  });

  it("reads Claude's text blocks and skips its thinking", () => {
    expect(
      answerText({
        content: [
          { type: "thinking", thinking: "Let me see." },
          { type: "text", text: '{"ok":' },
          { type: "text", text: "true}" },
        ],
        stop_reason: "end_turn",
      }),
    ).toBe('{"ok":true}');
  });

  it("says when there is no answer", () => {
    expect(() => answerText({ content: [] })).toThrow(
      "The model returned no answer",
    );
  });
});
