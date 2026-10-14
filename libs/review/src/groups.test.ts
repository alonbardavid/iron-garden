import { describe, expect, it } from "vitest";
import {
  groupProblems,
  MAX_GROUPS,
  referencePaths,
  type FileExtent,
} from "./groups";

const files: FileExtent[] = [
  { path: "src/a.ts", change: "modified", oldLines: 10, newLines: 20 },
  { path: "src/gone.ts", change: "deleted", oldLines: 5, newLines: 0 },
  { path: "src/new.ts", change: "added", oldLines: 0, newLines: 8 },
];

const group = (path: string, start: number, end: number) => ({
  title: "g",
  kind: "flow" as const,
  ranges: [{ path, start, end }],
});

describe("groupProblems", () => {
  it("accepts ranges inside changed files, old lines for deleted ones", () => {
    expect(
      groupProblems(
        [group("src/a.ts", 1, 20), group("src/gone.ts", 2, 5)],
        files,
      ),
    ).toEqual([]);
  });

  it("names every range that is off a changed file or out of bounds", () => {
    expect(
      groupProblems(
        [
          group("README.md", 1, 1),
          group("src/a.ts", 0, 3),
          group("src/a.ts", 5, 4),
          group("src/a.ts", 19, 21),
          group("src/gone.ts", 1, 6),
        ],
        files,
      ),
    ).toEqual([
      "groups[0].ranges[0]: README.md is not a changed file",
      "groups[1].ranges[0]: lines 0-3 are outside src/a.ts, which has 20 lines",
      "groups[2].ranges[0]: lines 5-4 are outside src/a.ts, which has 20 lines",
      "groups[3].ranges[0]: lines 19-21 are outside src/a.ts, which has 20 lines",
      "groups[4].ranges[0]: lines 1-6 are outside src/gone.ts, which has 5 lines",
    ]);
  });

  it("checks where moved lines came from against the old file", () => {
    const moved = (path: string, start: number, end: number) => ({
      title: "g",
      kind: "move" as const,
      ranges: [
        {
          path: "src/new.ts",
          start: 1,
          end: 5,
          movedFrom: { path, start, end },
        },
      ],
    });
    expect(
      groupProblems(
        [
          moved("src/gone.ts", 1, 5),
          moved("src/a.ts", 3, 11),
          moved("src/new.ts", 1, 2),
        ],
        files,
      ),
    ).toEqual([
      "groups[1].ranges[0].movedFrom: lines 3-11 are outside the old version of src/a.ts, which has 10 lines",
      "groups[2].ranges[0].movedFrom: src/new.ts must be a changed file that existed before this change",
    ]);
  });

  it("checks a reference against the target branch's version of its file", () => {
    const copied = (path: string, start: number, end: number) => ({
      title: "g",
      kind: "copy" as const,
      ranges: [
        {
          path: "src/new.ts",
          start: 1,
          end: 8,
          reference: { path, start, end },
        },
      ],
    });
    const groups = [
      copied("src/routes/credits.ts", 20, 28),
      copied("src/routes/credits.ts", 20, 31),
      copied("src/new.ts", 1, 2),
      copied("logo.png", 1, 1),
    ];
    expect(referencePaths(groups)).toEqual([
      "src/routes/credits.ts",
      "src/new.ts",
      "logo.png",
    ]);
    expect(
      groupProblems(
        groups,
        files,
        new Map([
          ["src/routes/credits.ts", 30],
          ["logo.png", null],
        ]),
      ),
    ).toEqual([
      "groups[1].ranges[0].reference: lines 20-31 are outside the target branch's src/routes/credits.ts, which has 30 lines",
      "groups[2].ranges[0].reference: src/new.ts must be a text file on the target branch",
      "groups[3].ranges[0].reference: logo.png must be a text file on the target branch",
    ]);
  });

  it("caps the number of groups", () => {
    const many = Array.from({ length: MAX_GROUPS + 1 }, () =>
      group("src/a.ts", 1, 1),
    );
    expect(groupProblems(many, files)).toHaveLength(1);
  });
});
