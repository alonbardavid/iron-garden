import { expect, it } from "vitest";
import { renderChanges } from "./changes";

const text = (lines: string[]) => ({
  kind: "text" as const,
  text: lines.join("\n") + "\n",
});
const numbered = (n: number) =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`);

it("numbers both sides and leaves out unchanged lines far from a change", () => {
  const before = numbered(20);
  const after = [...before];
  after[9] = "changed";
  const out = renderChanges(
    [
      {
        path: "a.ts",
        change: "modified",
        before: text(before),
        after: text(after),
      },
    ],
    10_000,
  );
  expect(out.split("\n")).toEqual([
    "### a.ts (modified)",
    "    7     7   line 7",
    "    8     8   line 8",
    "    9     9   line 9",
    "   10       - line 10",
    "         10 + changed",
    "   11    11   line 11",
    "   12    12   line 12",
    "   13    13   line 13",
  ]);
});

it("marks gaps between changes", () => {
  const before = numbered(30);
  const after = [...before];
  after[2] = "first";
  after[25] = "second";
  const out = renderChanges(
    [
      {
        path: "a.ts",
        change: "modified",
        before: text(before),
        after: text(after),
      },
    ],
    10_000,
  );
  expect(out).toContain("    6     6   line 6\n...\n   23    23   line 23");
});

it("shows an added file as all added lines", () => {
  const out = renderChanges(
    [{ path: "new.ts", change: "added", before: null, after: text(["a"]) }],
    10_000,
  );
  expect(out).toBe("### new.ts (added)\n          1 + a");
});

it("lists files past the budget without showing them", () => {
  const file = (path: string) => ({
    path,
    change: "added" as const,
    before: null,
    after: text(numbered(50)),
  });
  const out = renderChanges([file("a.ts"), file("b.ts")], 1500);
  expect(out).toContain("### a.ts (added)");
  expect(out).toContain("### Not shown, too large for one prompt\n- b.ts");
});

it("says when a file is not text", () => {
  const out = renderChanges(
    [
      {
        path: "logo.png",
        change: "added",
        before: null,
        after: { kind: "binary", bytes: 10 },
      },
    ],
    10_000,
  );
  expect(out).toBe("### logo.png (added)\n(binary or too large to show)");
});
