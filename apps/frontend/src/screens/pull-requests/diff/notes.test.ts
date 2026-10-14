import { describe, expect, it } from "vitest";
import { diffLines } from "@lib/diff";
import { clustersOf, lineNumbers, linesText } from "./notes";

const lines = diffLines("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n");

describe("lineNumbers", () => {
  it("gives a removed line the new line that replaces it", () => {
    expect(lines.map((l) => l.kind)).toEqual([
      "same",
      "removed",
      "added",
      "same",
      "same",
      "added",
    ]);
    expect(lineNumbers(lines, false)).toEqual([1, 2, 2, 3, 4, 5]);
  });
});

describe("clustersOf", () => {
  it("joins overlapping items and keeps the rest apart", () => {
    const clusters = clustersOf(
      [
        { id: "late", start: 5, end: 5 },
        { id: "wide", start: 1, end: 3 },
        { id: "inner", start: 2, end: 2 },
        { id: "gone", start: 40, end: 41 },
      ],
      lines,
      false,
    );
    expect(clusters).toEqual([
      { key: "wide", ids: ["wide", "inner"], from: 0, to: 4, start: 1, end: 3 },
      { key: "late", ids: ["late"], from: 5, to: 6, start: 5, end: 5 },
    ]);
  });
});

describe("linesText", () => {
  it("names one line or a range", () => {
    expect(linesText({ start: 4, end: 4 })).toBe("line 4");
    expect(linesText({ start: 4, end: 9 })).toBe("lines 4–9");
  });
});
