import { describe, expect, it } from "vitest";
import { diffLines } from "@lib/diff";
import { partners } from "./model";
import { compareWithReference, renameSpans, statsText } from "./reference";

const text = (lines: string[]) => lines.map((l) => `${l}\n`).join("");

const reference = text([
  "import { a } from 'a';",
  "export const credits = route();",
  "credits.get(() => {",
  "  const customer = find();",
  "  if (!customer) return 404;",
  "  return customer.credits;",
  "});",
]);

describe("compareWithReference", () => {
  it("matches each copied line with the reference line it came from", () => {
    const after = text([
      "// usage",
      "export const usage = route();",
      "usage.get(() => {",
      "  const customer = find();",
      "  if (!customer) return 410;",
      "  return customer.credits.total;",
      "});",
    ]);
    const lines = diffLines("", after);
    const compare = compareWithReference(
      lines,
      { from: 0, to: lines.length },
      partners(lines),
      reference,
      { start: 2, end: 7 },
    );
    const at = (i: number) => {
      const line = compare.copied.get(i)!;
      return [line.match, line.reference?.line ?? null];
    };
    expect([0, 1, 2, 3, 4, 5, 6].map(at)).toEqual([
      ["new", null],
      ["rename", 2],
      ["rename", 3],
      ["same", 4],
      ["changed", 5],
      ["changed", 6],
      ["same", 7],
    ]);
    expect(compare.copied.get(1)!.spans).toEqual([[13, 18]]);
    expect(compare.stats).toEqual({
      same: 2,
      rename: 2,
      changed: 2,
      new: 1,
      leftOut: 0,
    });
  });

  it("keeps reference lines the copy left out beside the next copied line", () => {
    const after = text(["credits.get(() => {", "  throw new Error();", "});"]);
    const lines = diffLines("", after);
    const compare = compareWithReference(
      lines,
      { from: 0, to: lines.length },
      partners(lines),
      reference,
      { start: 3, end: 7 },
    );
    expect(compare.leftOut.get(1)!.map((l) => l.line)).toEqual([4, 5, 6]);
    expect(compare.copied.get(1)!.match).toBe("new");
    expect(compare.trailing).toBeNull();
    expect(statsText(compare.stats)).toBe("2 same · 1 new · 3 left out");
  });

  it("leaves lines that replace old ones out of the comparison", () => {
    const lines = diffLines(
      text(["x", "old"]),
      text(["x", "new", "export const credits = route();"]),
    );
    const compare = compareWithReference(
      lines,
      { from: 0, to: lines.length },
      partners(lines),
      reference,
      { start: 2, end: 2 },
    );
    expect([...compare.copied.keys()]).toEqual([3]);
    expect(compare.copied.get(3)!.match).toBe("same");
  });
});

describe("renameSpans", () => {
  it("marks the names that differ when nothing else does", () => {
    expect(renameSpans("const a = b(c);", "const x = b(yy);")).toEqual([
      [6, 7],
      [12, 14],
    ]);
    expect(renameSpans("const a = 1;", "const a = 2;")).toBeNull();
    expect(renameSpans("f(a)", "f(a, b)")).toBeNull();
  });
});
