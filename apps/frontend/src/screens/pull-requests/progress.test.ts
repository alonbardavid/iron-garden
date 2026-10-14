import { describe, expect, it } from "vitest";
import { MAX_ACCEPT_CHANGES, type Review } from "@lib/contract";
import {
  acceptedText,
  marksOf,
  rangesChanges,
  requests,
  ruleRanges,
  stateOf,
  sweepsHighImpact,
  withAccepted,
} from "./progress";

const review: Review = {
  revision: 1,
  files: [
    {
      path: "a.ts",
      changes: [
        { key: "a1", at: 2 },
        { key: "a2", at: 10 },
        { key: "a3", at: 30 },
      ],
      accepted: ["a2", "a3"],
      auto: ["a3"],
    },
    { path: "b.ts", changes: [{ key: "b1", at: 1 }], accepted: [], auto: [] },
  ],
  rules: [
    {
      id: "r1",
      ruleId: "rule1",
      name: "Money math",
      match: { kind: "prompt", prompt: "money", paths: [] },
      action: "high-impact",
      reviewers: [],
      workflow: null,
      dispatch: null,
      files: [{ path: "b.ts", keys: ["b1"] }],
    },
  ],
};

describe("marks", () => {
  const marks = marksOf(review);

  it("finds a range's changes by the line each change is at", () => {
    expect(marks.changes("a.ts", { start: 2, end: 10 })).toEqual([
      { path: "a.ts", key: "a1" },
      { path: "a.ts", key: "a2" },
    ]);
    expect(marks.changes("missing.ts")).toEqual([]);
  });

  it("counts a change two ranges cover once", () => {
    const changes = rangesChanges(marks, [
      { path: "a.ts", start: 1, end: 10 },
      { path: "a.ts", start: 10, end: 40 },
    ]);
    expect(changes.map((c) => c.key)).toEqual(["a1", "a2", "a3"]);
    expect(marks.progress(changes)).toEqual({
      total: 3,
      accepted: 2,
      auto: 1,
      high: 0,
    });
  });

  it("counts high-impact changes not accepted yet", () => {
    expect(marks.isHigh({ path: "b.ts", key: "b1" })).toBe(true);
    expect(marks.progress(marks.changes("b.ts")).high).toBe(1);
    expect(marks.rulesOf({ path: "b.ts", key: "b1" })[0]!.name).toBe(
      "Money math",
    );
  });

  it("splits a rule's changes into ranges where other changes come between", () => {
    const rule = {
      ...review.rules[0]!,
      files: [{ path: "a.ts", keys: ["a1", "a3"] }],
    };
    expect(ruleRanges(marks, rule)).toEqual([
      { path: "a.ts", start: 2, end: 2 },
      { path: "a.ts", start: 30, end: 30 },
    ]);
  });

  it("warns only when a selection mixes high-impact and regular changes", () => {
    const all = marks.all();
    expect(sweepsHighImpact(marks, all)).toEqual([{ path: "b.ts", key: "b1" }]);
    expect(sweepsHighImpact(marks, marks.changes("b.ts"))).toBeNull();
    expect(sweepsHighImpact(marks, marks.changes("a.ts"))).toBeNull();
  });

  it("tells done, partly accepted and untouched apart", () => {
    expect(stateOf(marks.progress(marks.changes("a.ts")))).toBe("partial");
    expect(stateOf(marks.progress(marks.changes("b.ts")))).toBe("none");
    expect(stateOf({ total: 0, accepted: 0 })).toBe("done");
  });

  it.each([
    [{ total: 1, accepted: 0 }, "1 change, not accepted"],
    [{ total: 1, accepted: 1 }, "The one change is accepted"],
    [{ total: 4, accepted: 0 }, "4 changes, none accepted"],
    [{ total: 4, accepted: 3 }, "3 of 4 changes accepted"],
    [{ total: 4, accepted: 4 }, "All 4 changes accepted"],
    [
      { total: 15, accepted: 6, auto: 5, high: 2 },
      "15 changes · 1 accepted · 5 auto-accepted · 2 high impact, not accepted yet",
    ],
  ])("says %j as %j", (progress, text) => {
    expect(acceptedText(progress)).toBe(text);
  });
});

describe("withAccepted", () => {
  it("accepts and undoes changes in the files named, in diff order", () => {
    const accepted = withAccepted(
      review,
      [
        { path: "a.ts", keys: ["a3"] },
        { path: "a.ts", keys: ["a1"] },
      ],
      true,
    );
    expect(accepted.files[0]!.accepted).toEqual(["a1", "a2", "a3"]);
    expect(accepted.files[0]!.auto).toEqual(["a3"]);
    expect(accepted.files[1]).toBe(review.files[1]);
    const undone = withAccepted(
      accepted,
      [{ path: "a.ts", keys: ["a2", "a3"] }],
      false,
    );
    expect(undone.files[0]!.accepted).toEqual(["a1"]);
    expect(undone.files[0]!.auto).toEqual([]);
  });
});

describe("requests", () => {
  it("groups changes by file", () => {
    expect(
      requests([
        { path: "a", key: "1" },
        { path: "a", key: "2" },
        { path: "b", key: "3" },
      ]),
    ).toEqual([
      [
        { path: "a", keys: ["1", "2"] },
        { path: "b", keys: ["3"] },
      ],
    ]);
  });

  it("splits a selection larger than one request takes", () => {
    const changes = Array.from({ length: MAX_ACCEPT_CHANGES + 1 }, (_, i) => ({
      path: "big",
      key: String(i),
    }));
    const parts = requests(changes);
    expect(parts.map((p) => p.map((f) => f.keys.length))).toEqual([
      [MAX_ACCEPT_CHANGES],
      [1],
    ]);
  });
});
