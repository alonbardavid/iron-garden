import { describe, expect, it } from "vitest";
import { changedSpans, langOf, paint, paintLines } from "./syntax";

describe("paint", () => {
  it("colors keywords, strings, types and calls in code", () => {
    expect(
      paint('const usage = await aggregate(db, "x");', "code")
        .filter((p) => p.token !== "txt")
        .map((p) => [p.text, p.token]),
    ).toEqual([
      ["const", "kw"],
      ["await", "kw"],
      ["aggregate", "fn"],
      ['"x"', "str"],
    ]);
  });

  it("marks a span, cutting the tokens it crosses", () => {
    expect(
      paint("import { getCustomer }", "code", [9, 12])
        .filter((p) => p.marked)
        .map((p) => p.text),
    ).toEqual(["get"]);
  });

  it("leaves languages it does not know uncolored", () => {
    expect(langOf("docs/README.md")).toBe("text");
    expect(paint("const x = 1", "text")).toEqual([
      { text: "const x = 1", token: "txt", marked: false },
    ]);
  });
});

describe("paintLines", () => {
  const tokensOf = (lines: string[]) =>
    paintLines(lines, "code").map((line) =>
      line.filter((p) => p.text.trim()).map((p) => [p.text, p.token]),
    );

  it("carries a block comment across lines", () => {
    expect(
      tokensOf(["/**", " * Says hi.", " */ const x = 1;", "let y;"]),
    ).toEqual([
      [["/**", "com"]],
      [[" * Says hi.", "com"]],
      [
        [" */", "com"],
        ["const", "kw"],
        ["x", "txt"],
        ["=", "txt"],
        ["1", "num"],
        [";", "txt"],
      ],
      [
        ["let", "kw"],
        ["y", "txt"],
        [";", "txt"],
      ],
    ]);
  });

  it("closes a comment on its own line and ignores one inside a string", () => {
    expect(tokensOf(['/* a */ let s = "/*";', "let t;"])).toEqual([
      [
        ["/* a */", "com"],
        ["let", "kw"],
        ["s", "txt"],
        ["=", "txt"],
        ['"/*"', "str"],
        [";", "txt"],
      ],
      [
        ["let", "kw"],
        ["t", "txt"],
        [";", "txt"],
      ],
    ]);
  });
});

describe("changedSpans", () => {
  it("finds what changed between a line and its replacement", () => {
    expect(changedSpans("getCustomer(db)", "fetchCustomer(db)")).toEqual({
      before: [0, 3],
      after: [0, 5],
    });
  });

  it("marks nothing when most of the line changed", () => {
    expect(changedSpans("return a;", "throw new Error(b);")).toBeNull();
  });
});
