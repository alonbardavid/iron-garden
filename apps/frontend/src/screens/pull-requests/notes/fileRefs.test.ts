import { describe, expect, it } from "vitest";
import { changedPathPattern, fileRefOf, splitChangedPaths } from "./fileRefs";

const changed = new Set(["src/routes/invoices.ts", "src/a.ts", "README.md"]);

describe("fileRefOf", () => {
  it.each([
    ["src/a.ts", "src/a.ts"],
    ["./src/a.ts", "src/a.ts"],
    ["src/a.ts:12", "src/a.ts"],
    ["src/a.ts:12-20", "src/a.ts"],
    ["src/a.ts#L4-L9", "src/a.ts"],
    ["README.md", "README.md"],
    ["/home/user/repo/src/routes/invoices.ts:4", "src/routes/invoices.ts"],
  ])("names the changed file in %s", (text, path) => {
    expect(fileRefOf(text, changed)).toEqual({ path, changed: true });
  });

  it("names a file the pull request did not change", () => {
    expect(fileRefOf("packages/metering/src/aggregate.ts", changed)).toEqual({
      path: "packages/metering/src/aggregate.ts",
      changed: false,
    });
  });

  it.each([
    "pnpm test",
    "https://example.com/src/a.ts",
    "Intl.NumberFormat",
    "@lumen/metering",
    "/etc/hosts.conf",
    "c.json",
    "",
  ])("names no file in %j", (text) => {
    expect(fileRefOf(text, changed)).toBeNull();
  });
});

describe("splitChangedPaths", () => {
  const split = (text: string) =>
    splitChangedPaths(text, changedPathPattern(changed), changed);

  it("links the changed files text names, with their lines", () => {
    expect(split("Edited src/a.ts:4 and README.md.")).toEqual([
      "Edited ",
      { text: "src/a.ts:4", path: "src/a.ts" },
      " and ",
      { text: "README.md", path: "README.md" },
      ".",
    ]);
  });

  it("links an absolute path that ends in a changed file", () => {
    expect(split("see /work/repo/src/a.ts")).toEqual([
      "see ",
      { text: "/work/repo/src/a.ts", path: "src/a.ts" },
    ]);
  });

  it("leaves a longer name that starts with a changed path alone", () => {
    expect(split("src/a.tsx and src/a.ts.bak and lib/src/a.ts")).toEqual([
      "src/a.tsx and src/a.ts.bak and lib/src/a.ts",
    ]);
  });

  it("leaves text alone when nothing changed", () => {
    expect(splitChangedPaths("src/a.ts", null, new Set())).toEqual([
      "src/a.ts",
    ]);
  });
});
