import { describe, expect, it } from "vitest";
import { pathMatcher, patternProblem } from "./patterns";

describe("pathMatcher", () => {
  it("keeps * inside a folder and lets ** cross folders", () => {
    const match = pathMatcher(["api/*.ts", "web/**/*.gen.ts"]);
    expect(match("api/index.ts")).toBe(true);
    expect(match("api/routes/index.ts")).toBe(false);
    expect(match("web/schema.gen.ts")).toBe(true);
    expect(match("web/src/api/schema.gen.ts")).toBe(true);
  });

  it("reads a pattern with no folder as a file at the root", () => {
    const match = pathMatcher(["pnpm-lock.yaml"]);
    expect(match("pnpm-lock.yaml")).toBe(true);
    expect(match("web/pnpm-lock.yaml")).toBe(false);
  });

  it("matches everything under a folder with a trailing **", () => {
    const match = pathMatcher(["api/migrations/**"]);
    expect(match("api/migrations/0042_usage.sql")).toBe(true);
    expect(match("api/migrations.ts")).toBe(false);
  });

  it("takes either side of braces and escapes regex characters", () => {
    const match = pathMatcher(["src/*.{ts,tsx}", "app/(marketing)/**"]);
    expect(match("src/a.tsx")).toBe(true);
    expect(match("src/a.js")).toBe(false);
    expect(match("app/(marketing)/page.tsx")).toBe(true);
    expect(match("app/marketing/page.tsx")).toBe(false);
  });

  it("searches the path with regexes", () => {
    const match = pathMatcher(["\\.gen\\.ts$"], "regex");
    expect(match("web/src/api/schema.gen.ts")).toBe(true);
    expect(match("web/src/api/schema.ts")).toBe(false);
  });
});

describe("patternProblem", () => {
  it("names a regex that does not compile", () => {
    expect(patternProblem("(", "regex")).toBe(
      "( is not a valid regular expression",
    );
    expect(patternProblem("a.*", "regex")).toBeNull();
  });
});
