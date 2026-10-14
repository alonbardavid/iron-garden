import { describe, expect, it } from "vitest";
import { changesOf } from "@lib/diff";
import {
  blocksOf,
  changesIn,
  chunkLabel,
  chunksOf,
  chunkViews,
  partners,
  rangeSlice,
  reveal,
  scopeOf,
  type DiffLine,
  type Reveal,
} from "./model";

const same = (old: number, n: number): DiffLine => ({
  kind: "same",
  text: `line ${n}`,
  old,
  new: n,
});
const removed = (old: number): DiffLine => ({
  kind: "removed",
  text: `old ${old}`,
  old,
});
const added = (n: number): DiffLine => ({
  kind: "added",
  text: `new ${n}`,
  new: n,
});

// 40 unchanged lines with line 20 replaced.
const file: DiffLine[] = [
  ...Array.from({ length: 19 }, (_, i) => same(i + 1, i + 1)),
  removed(20),
  added(20),
  ...Array.from({ length: 20 }, (_, i) => same(i + 21, i + 21)),
];

describe("chunks and gaps", () => {
  const chunks = chunksOf(file);
  const views = (reveals: Reveal[] = []) =>
    chunkViews(chunks, file.length, reveals);

  it("makes a chunk of each change and three lines either side, with the rest in gaps", () => {
    expect(chunks).toEqual([{ from: 16, to: 24 }]);
    expect(views()).toEqual([
      {
        chunk: { from: 16, to: 24 },
        gapAbove: expect.objectContaining({
          index: 0,
          hidden: 16,
          place: "above",
        }),
        before: { from: 16, to: 16 },
        after: { from: 24, to: 24 },
        gapBelow: expect.objectContaining({
          index: 1,
          hidden: 17,
          place: "below",
        }),
      },
    ]);
  });

  it("opens the gap above the first chunk upwards and the one below the last downwards, 20 lines at a time", () => {
    const [view] = views();
    let reveals = reveal([], view!.gapAbove!, "up");
    reveals = reveal(reveals, view!.gapBelow!, "down");
    expect(views(reveals)[0]).toMatchObject({
      gapAbove: null,
      before: { from: 0, to: 16 },
      after: { from: 24, to: 41 },
      gapBelow: null,
    });
  });

  it("opens a gap between chunks from either end, and gives it to the first chunk once it is all open", () => {
    const two: DiffLine[] = [
      added(1),
      ...Array.from({ length: 50 }, (_, i) => same(i + 1, i + 2)),
      added(52),
    ];
    const twoChunks = chunksOf(two);
    expect(twoChunks).toEqual([
      { from: 0, to: 4 },
      { from: 48, to: 52 },
    ]);
    const [, second] = chunkViews(twoChunks, two.length, []);
    const gap = second!.gapAbove!;
    expect(gap).toMatchObject({
      from: 4,
      to: 48,
      hidden: 44,
      place: "between",
    });
    const down = reveal([], gap, "down");
    const both = reveal(
      down,
      chunkViews(twoChunks, two.length, down)[1]!.gapAbove!,
      "up",
    );
    const [a, b] = chunkViews(twoChunks, two.length, both);
    expect(a!.after).toEqual({ from: 4, to: 24 });
    expect(b!.before).toEqual({ from: 28, to: 48 });
    expect(b!.gapAbove).toMatchObject({ hidden: 4 });
    const all = reveal(both, b!.gapAbove!, "all");
    const [c, d] = chunkViews(twoChunks, two.length, all);
    expect(c!.after).toEqual({ from: 4, to: 48 });
    expect(d!.before).toEqual({ from: 48, to: 48 });
    expect(d!.gapAbove).toBeNull();
  });
});

describe("chunkLabel", () => {
  it("counts new lines, or old ones for a chunk that only removes", () => {
    expect(chunkLabel(file.slice(16, 24))).toBe("Lines 17–23");
    expect(chunkLabel([removed(4), removed(5)])).toBe("Removed lines 4–5");
    expect(chunkLabel([added(7)])).toBe("Line 7");
  });
});

describe("rangeSlice", () => {
  it("takes the new lines in range and the removed lines they replace", () => {
    expect(rangeSlice(file, { start: 20, end: 21 }, false)).toEqual({
      from: 19,
      to: 22,
    });
  });

  it("gives removed lines at the end of a file to its last line", () => {
    const tail: DiffLine[] = [same(1, 1), same(2, 2), removed(3)];
    expect(rangeSlice(tail, { start: 2, end: 2 }, false)).toEqual({
      from: 1,
      to: 3,
    });
  });

  it("counts old lines for a deleted file", () => {
    const gone = [removed(1), removed(2), removed(3)];
    expect(rangeSlice(gone, { start: 2, end: 3 }, true)).toEqual({
      from: 1,
      to: 3,
    });
  });
});

describe("partners", () => {
  it("gives each paired line its partner, for marking what changed", () => {
    expect(partners([same(1, 1), removed(2), added(2), added(3)])).toEqual([
      null,
      2,
      1,
      null,
    ]);
  });
});

describe("blocks", () => {
  // A replaced line, then two added lines, then an unchanged one and a lone
  // removal.
  const lines = [
    removed(1),
    added(1),
    added(2),
    added(3),
    same(2, 4),
    removed(3),
  ];
  const changes = changesOf(lines);
  const owner = lines.map(
    (_, i) => changes.find((c) => c.lines.includes(i)) ?? null,
  );

  it("collects the changes in a span once each", () => {
    expect(changesIn(owner, { from: 0, to: 4 })).toEqual(changes.slice(0, 3));
  });

  it("makes a block of a run with more than one change, headed by its first row", () => {
    const blocks = blocksOf(owner);
    expect(blocks.map((b) => b && b.head)).toEqual([
      true,
      false,
      false,
      false,
      null,
      null,
    ]);
    expect(blocks[0]!.changes).toHaveLength(3);
  });
});

describe("scopeOf", () => {
  const code = (texts: string[]): DiffLine[] =>
    texts.map((text, i) => ({ kind: "same", text, old: i + 1, new: i + 1 }));
  const lines = code([
    "import { x } from './x';",
    "",
    "export function doTheThing(a: number) {",
    "  const b = a + 1;",
    "  if (b > 2) {",
    "    return b;",
    "  }",
    "  return 0;",
    "}",
    "class Box {",
    "  open(lid: Lid): void {",
    "    lid.lift();",
    "  }",
    "}",
  ]);

  it("names the function a line sits in, past blocks inside it", () => {
    expect(scopeOf(lines, 5, 5)?.text).toBe(
      "export function doTheThing(a: number) {",
    );
  });

  it("names the innermost declaration, such as a method in a class", () => {
    expect(scopeOf(lines, 11, 11)?.text).toBe("open(lid: Lid): void {");
  });

  it("names nothing when the declaration is already shown", () => {
    expect(scopeOf(lines, 5, 2)).toBeNull();
  });

  it("names nothing at the top level", () => {
    expect(scopeOf(lines, 9, 9)).toBeNull();
  });

  it("reads a signature split over lines from its first line", () => {
    const component = code([
      "export const Section = ({",
      "  title,",
      "  children,",
      "}: {",
      "  title: string;",
      "  children: ReactNode;",
      "}) => {",
      "  const id = useId();",
      "  return (",
      "    <Paper aria-labelledby={id}>",
      "      {children}",
      "    </Paper>",
      "  );",
      "};",
      "function load(",
      "  id: string,",
      "): Promise<void> {",
      "  return fetch(id);",
      "}",
    ]);
    expect(scopeOf(component, 10, 10)).toEqual({
      line: 0,
      text: "export const Section = ({",
    });
    expect(scopeOf(component, 17, 17)?.text).toBe("function load(");
  });

  it("names object methods and tests", () => {
    const more = code([
      'describe("totals", () => {',
      '  it("rounds", () => {',
      "    expect(total(1)).toBe(1);",
      "  });",
      "});",
      "const components = {",
      "  img: ({ src }) =>",
      "    src ? <a href={src} /> : null,",
      "};",
    ]);
    expect(scopeOf(more, 2, 2)?.text).toBe('it("rounds", () => {');
    expect(scopeOf(more, 7, 7)?.text).toBe("img: ({ src }) =>");
  });

  it("opens a gap up to the declaration it names", () => {
    const [view] = chunkViews(chunksOf(file), file.length, []);
    const gap = view!.gapAbove!;
    const [opened] = reveal([], gap, { upTo: 5 });
    expect(opened).toEqual({ top: 0, bottom: gap.to - 5 });
  });
});
