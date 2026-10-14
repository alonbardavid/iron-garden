import { describe, expect, it } from "vitest";
import { changesOf, diffLines } from "@lib/diff";
import { autoAccepted, matchFile, ruleFiles, type RunRule } from "./evaluate";

const lock: RunRule = {
  id: "lock",
  match: { kind: "files", syntax: "glob", patterns: ["pnpm-lock.yaml"] },
  action: "auto-accept",
  ranges: null,
};
const imports: RunRule = {
  id: "imports",
  match: { kind: "structure", constructs: ["imports"], paths: ["src/**"] },
  action: "auto-accept",
  ranges: null,
};
const money: RunRule = {
  id: "money",
  match: { kind: "prompt", prompt: "money", paths: ["src/billing/**"] },
  action: "high-impact",
  ranges: [
    { path: "src/billing/total.ts", start: 2, end: 2 },
    { path: "src/other.ts", start: 1, end: 9 },
  ],
};

describe("matchFile", () => {
  const before = 'import { a } from "a";\nconst x = a;\n';
  const after =
    'import { a } from "a";\nimport { b } from "b";\nconst x = a;\nconst y = b;\n';
  const lines = diffLines(before, after);
  const changes = changesOf(lines).map(
    (c) => [c.key, c.at] as [string, number],
  );

  it("matches every change of a named file, and imports in scripts in scope", () => {
    const text = { lines, before, after };
    expect(
      matchFile([lock, imports, money], "pnpm-lock.yaml", changes, text),
    ).toEqual({ lock: changes.map(([key]) => key) });
    expect(
      Object.keys(matchFile([lock, imports, money], "src/a.ts", changes, text)),
    ).toEqual(["imports"]);
    expect(matchFile([imports], "lib/a.ts", changes, text)).toEqual({});
  });
});

describe("ruleFiles", () => {
  it("finds a prompt rule's changes by line, inside the rule's files only", () => {
    const files = [
      {
        path: "src/billing/total.ts",
        changes: [
          ["k1", 1],
          ["k2", 2],
        ] as [string, number][],
        matches: {},
      },
      {
        path: "src/other.ts",
        changes: [["k3", 3]] as [string, number][],
        matches: {},
      },
    ];
    expect(ruleFiles(money, files)).toEqual([
      { path: "src/billing/total.ts", keys: ["k2"] },
    ]);
  });

  it("collects auto-accepted changes across rules", () => {
    const files = [
      {
        path: "pnpm-lock.yaml",
        changes: [["k1", 1]] as [string, number][],
        matches: { lock: ["k1"] },
      },
    ];
    expect([...autoAccepted([lock, money], files)]).toEqual([
      "pnpm-lock.yaml\nk1",
    ]);
  });
});
