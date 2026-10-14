import { describe, expect, it } from "vitest";
import { answerPrompt, questionText } from "./answer-prompt";

const INPUT = {
  repository: "billing",
  pullRequest: {
    number: 7,
    title: "Bill usage",
    description: null,
    branch: "usage",
    targetBranch: "main",
    baseCommit: "a".repeat(40),
    headCommit: "b".repeat(40),
  },
  changedFiles: "- src/usage.ts (added)",
  groups: [],
  transcripts: "(none)",
  changes: "### src/usage.ts",
  conversation: [],
  maxConversationChars: 10_000,
};

describe("answerPrompt", () => {
  it("carries the change, and says what it lacks", () => {
    const prompt = answerPrompt(INPUT);
    expect(prompt).toContain("pull request #7 in billing");
    expect(prompt).toContain("Description:\n(none)");
    expect(prompt).toContain("## Its groups\n\n(not grouped yet)");
    expect(prompt).toContain("## How it was made");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("(this is the first question)");
  });

  it("lists the groups and the conversation so far", () => {
    const prompt = answerPrompt({
      ...INPUT,
      groups: [
        {
          title: "Usage flow",
          kind: "flow",
          description: "How a call is billed.",
          ranges: [{ path: "src/usage.ts", start: 1, end: 9 }],
        },
      ],
      conversation: [
        {
          sender: "person",
          body: "Is this safe?",
          context: { page: "files", path: "src/usage.ts" },
        },
        { sender: "agent", body: "Yes." },
      ],
    });
    expect(prompt).toContain(
      "1. Usage flow (flow): src/usage.ts:1-9\nHow a call is billed.",
    );
    expect(prompt).toContain(
      "Reviewer (looking at the files tab, src/usage.ts): Is this safe?\n\nYou: Yes.",
    );
  });

  it("keeps the whole thread, dropping the oldest only past the budget", () => {
    const conversation = Array.from({ length: 30 }, (_, i) => ({
      sender: i % 2 === 0 ? ("person" as const) : ("agent" as const),
      body: `message ${i}`,
    }));
    const all = answerPrompt({ ...INPUT, conversation });
    expect(all).toContain("Reviewer: message 0");
    expect(all).toContain("You: message 29");
    const cut = answerPrompt({
      ...INPUT,
      conversation,
      maxConversationChars: 40,
    });
    expect(cut).toContain("You: message 29");
    expect(cut).not.toContain("Reviewer: message 0");
    expect(cut).toMatch(/\((\d+) earlier messages left out\)/);
  });
});

describe("questionText", () => {
  it("says what the reviewer was looking at and had selected", () => {
    expect(
      questionText({
        author: "Maya",
        body: "Why round here?",
        context: {
          page: "groups",
          group: "PRG_1",
          path: "src/usage.ts",
          start: 3,
          end: 5,
          selectedText: "Math.round",
        },
        groupTitle: "Usage flow",
      }),
    ).toBe(
      'Maya asks (looking at the groups tab, the group "Usage flow", src/usage.ts, lines 3-5):\n\nWhy round here?\n\nThey had selected this text on the page:\n\n```\nMath.round\n```',
    );
    expect(questionText({ author: "Maya", body: "Hi", context: null })).toBe(
      "Maya asks:\n\nHi",
    );
  });
});
