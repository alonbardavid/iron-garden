import { describe, expect, it } from "vitest";
import {
  groupPullRequest,
  MAX_ATTEMPTS,
  MAX_READ_TURNS,
  parseReply,
  type ChatMessage,
  type GroupingAnswer,
  type GroupingTools,
  type SessionRepository,
} from "./processor";

const GROUP = {
  title: "Usage flow",
  kind: "flow",
  ranges: [{ path: "a.ts", start: 1, end: 2 }],
};

const REPOSITORY: SessionRepository = {
  list: async (version, directory) => ({
    paths: [`${directory}/a.ts`, `${directory}/b.ts`].map((p) =>
      version === "base" ? p : `${p}.new`,
    ),
    truncated: false,
  }),
  read: async (_version, path) =>
    path === "missing.ts"
      ? null
      : { kind: "text", text: "one\ntwo\n", lines: 2, truncated: false },
};

// A model that gives each reply in turn, and a checker that finds problems
// in every answer whose first group has no ranges.
function tools(replies: string[]) {
  const asked: ChatMessage[][] = [];
  const fake: GroupingTools = {
    prompt: async () => "Group #1",
    complete: async (messages) => {
      asked.push([...messages]);
      return replies[asked.length - 1] ?? "{}";
    },
    check: async (answer: GroupingAnswer) =>
      (answer.groups[0] as typeof GROUP | undefined)?.ranges.length
        ? []
        : ["groups[0]: name at least one range"],
  };
  return { fake, asked };
}

const answer = (groups: unknown[]) => JSON.stringify({ groups });

describe("groupPullRequest", () => {
  it("returns the first answer without problems", async () => {
    const { fake, asked } = tools([answer([GROUP])]);
    expect(await groupPullRequest(fake, REPOSITORY)).toEqual({
      ok: true,
      answer: { groups: [GROUP], rules: [] },
      attempts: 1,
    });
    expect(asked[0]![0]).toEqual({ role: "system", content: "Group #1" });
  });

  it("shows the model its problems and asks again", async () => {
    const { fake, asked } = tools([
      "not json",
      answer([{ ...GROUP, ranges: [] }]),
      answer([GROUP]),
    ]);
    const outcome = await groupPullRequest(fake, REPOSITORY);
    expect(outcome).toMatchObject({ ok: true, attempts: 3 });
    const retry = asked[2]!.at(-1)!;
    expect(retry.role).toBe("user");
    expect(retry.content).toContain("groups[0]: name at least one range");
  });

  it("reads the repository for the model before it answers", async () => {
    const { fake, asked } = tools([
      JSON.stringify({
        requests: [
          { read: "src/a.ts", at: "base" },
          { read: "missing.ts" },
          { list: "head", under: "src" },
        ],
      }),
      answer([GROUP]),
    ]);
    const outcome = await groupPullRequest(fake, REPOSITORY);
    expect(outcome).toMatchObject({ ok: true, attempts: 1 });
    const read = asked[1]!.at(-1)!.content;
    expect(read).toContain(
      "### src/a.ts at base (2 lines)\n    1  one\n    2  two",
    );
    expect(read).toContain("### missing.ts at head\n(no such file)");
    expect(read).toContain(
      "### Files under src at head\nsrc/a.ts.new\nsrc/b.ts.new",
    );
  });

  it("stops reading once the reads are spent", async () => {
    const reads = JSON.stringify({ requests: [{ read: "a.ts" }] });
    const { fake } = tools(
      Array.from({ length: MAX_READ_TURNS + MAX_ATTEMPTS }, () => reads),
    );
    const outcome = await groupPullRequest(fake, REPOSITORY);
    expect(outcome).toMatchObject({ ok: false, attempts: MAX_ATTEMPTS });
  });

  it("gives up after the last attempt", async () => {
    const { fake } = tools([]);
    const outcome = await groupPullRequest(fake, REPOSITORY);
    expect(outcome).toMatchObject({ ok: false, attempts: MAX_ATTEMPTS });
  });
});

describe("parseReply", () => {
  it("finds the object inside a code fence", () => {
    expect(parseReply('```json\n{"groups": [], "rules": []}\n```')).toEqual({
      kind: "answer",
      answer: { groups: [], rules: [] },
    });
  });

  it("refuses an object without groups", () => {
    expect(parseReply('{"group": []}')).toMatchObject({ kind: "invalid" });
  });

  it("refuses requests it cannot carry out", () => {
    expect(
      parseReply('{"requests": [{"read": "a.ts", "at": "main"}]}'),
    ).toMatchObject({ kind: "invalid" });
  });
});
