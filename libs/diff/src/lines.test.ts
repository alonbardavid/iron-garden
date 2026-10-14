import { describe, expect, it } from "vitest";
import { diffLines, splitLines, splitRows } from "./lines";

describe("splitLines", () => {
  it.each([
    ["", []],
    ["a", ["a"]],
    ["a\n", ["a"]],
    ["a\n\nb\n", ["a", "", "b"]],
  ])("splits %j", (text, lines) => {
    expect(splitLines(text)).toEqual(lines);
  });
});

describe("diffLines", () => {
  it("numbers unchanged, removed and added lines on their own sides", () => {
    expect(diffLines("a\nb\nc\n", "a\nB\nc\nd\n")).toEqual([
      { kind: "same", text: "a", old: 1, new: 1 },
      { kind: "removed", text: "b", old: 2 },
      { kind: "added", text: "B", new: 2 },
      { kind: "same", text: "c", old: 3, new: 3 },
      { kind: "added", text: "d", new: 4 },
    ]);
  });

  it("treats a missing side as an empty file", () => {
    expect(diffLines("", "x\n")).toEqual([
      { kind: "added", text: "x", new: 1 },
    ]);
  });

  it("shows a rewrite past its edit bound as wholly replaced", () => {
    const before = Array.from({ length: 1200 }, (_, i) => `a${i}`).join("\n");
    const after = Array.from({ length: 1200 }, (_, i) => `b${i}`).join("\n");
    const lines = diffLines(before, after);
    expect(lines.filter((l) => l.kind === "removed")).toHaveLength(1200);
    expect(lines.slice(1200).every((l) => l.kind === "added")).toBe(true);
  });
});

describe("splitRows", () => {
  it("pairs removed lines with the added lines that replace them", () => {
    const rows = splitRows(diffLines("a\nb\nc\nd\n", "a\nB\nd\n"));
    expect(rows).toEqual([
      { left: 0, right: 0 },
      { left: 1, right: 3 },
      { left: 2, right: null },
      { left: 4, right: 4 },
    ]);
  });
});
