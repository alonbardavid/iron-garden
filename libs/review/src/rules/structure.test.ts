import { describe, expect, it } from "vitest";
import { changesOf, diffLines } from "@lib/diff";
import { commentLines, importLines, structureMatches } from "./structure";

describe("importLines", () => {
  it("finds single and multi-line imports, export-from and require", () => {
    const text = [
      'import { Hono } from "hono";',
      "import {",
      "  requireScope,",
      "  type Env,",
      '} from "../auth";',
      'import "./polyfill";',
      'export * from "./types";',
      'const fs = require("node:fs");',
      'const x = import("./lazy");',
      "export const y = 1;",
    ].join("\n");
    expect([...importLines(text)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});

describe("commentLines", () => {
  it("finds lines with only comments, ignoring // inside strings", () => {
    const text = [
      "// leading",
      "const a = 1; // trailing",
      "/**",
      " * JSDoc",
      " */",
      'const url = "http://example.com";',
      "/* inline */ const b = 2;",
      "  /* one line */",
    ].join("\n");
    expect([...commentLines(text)].sort((a, b) => a - b)).toEqual([
      1, 3, 4, 5, 8,
    ]);
  });
});

describe("structureMatches", () => {
  const before =
    'import { a } from "a";\n\nexport const x = a;\nexport const y = 1;\n';
  const after =
    'import { a } from "a";\nimport { b } from "b";\n\n// x is a\nexport const x = a;\nexport const y = 2; // two\n';
  const lines = diffLines(before, after);

  it("matches changes that only touch imports", () => {
    const keys = structureMatches(lines, before, after, ["imports"]);
    const changes = changesOf(lines);
    expect(keys).toHaveLength(1);
    expect(changes).toHaveLength(3);
    expect(changes.find((c) => c.key === keys[0])!.at).toBe(2);
  });

  it("matches comment-only changes but not ones that also change code", () => {
    const keys = structureMatches(lines, before, after, ["comments"]);
    const at = changesOf(lines)
      .filter((c) => keys.includes(c.key))
      .map((c) => c.at);
    expect(at).toEqual([4]);
  });
});
