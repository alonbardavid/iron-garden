import { describe, expect, it } from "vitest";
import { changesOf } from "./changes";
import { diffLines } from "./lines";

const keys = (before: string, after: string) =>
  changesOf(diffLines(before, after)).map((c) => c.key);

describe("changesOf", () => {
  it("counts a removed line and its replacement once", () => {
    const lines = diffLines("a\nb\nc\nd\n", "a\nB\nd\ne\n");
    expect(changesOf(lines).map(({ lines, at }) => ({ lines, at }))).toEqual([
      { lines: [1, 3], at: 2 },
      { lines: [2], at: 2 },
      { lines: [5], at: 4 },
    ]);
  });

  it("finds a removal by the new line after it, or the last line at the end", () => {
    const lines = diffLines("a\nb\nc\n", "a\n");
    expect(changesOf(lines).map((c) => c.at)).toEqual([1, 1]);
    expect(changesOf(diffLines("a\nb\nc\n", "c\n"))[0]!.at).toBe(1);
  });

  it("finds the changes of a deleted file by their old lines", () => {
    expect(changesOf(diffLines("a\nb\n", "")).map((c) => c.at)).toEqual([1, 2]);
  });

  it("keeps a change's key when lines are inserted above it", () => {
    const before = "x\ny\nz\n";
    const [key] = keys(before, "x\nY\nz\n");
    expect(keys("w\n" + before, "w\nx\nY\nz\n")).toEqual([key]);
  });

  it("gives the same change a new key when the line above it differs", () => {
    expect(keys("p\ny\n", "p\nY\n")).not.toEqual(keys("q\ny\n", "q\nY\n"));
  });

  it("tells repeated identical changes apart", () => {
    const [first, second] = keys("x\na\nx\na\n", "x\nb\nx\nb\n");
    expect(first).not.toBe(second);
    expect(second).toBe(`${first}.1`);
  });

  // Accepted changes are stored by key: a new key for the same change drops
  // every reviewer's mark on it. tests/e2e/review/fixture.ts seeds these.
  it("never changes the key of a change", () => {
    const before =
      'export const greeting = "hello";\nexport const name = "world";\n';
    const after =
      'export const greeting = "hi";\nexport const name = "world";\nexport const shout = true;\nexport const loud = true;\n';
    expect(keys(before, after)).toEqual([
      "ij42vw7t3x",
      "10b26e57rem",
      "xdmnnn44xx",
    ]);
  });
});
