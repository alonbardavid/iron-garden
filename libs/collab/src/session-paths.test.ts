import { describe, expect, it } from "vitest";
import { normalizeSessionPath, normalizeSessionPaths } from "./session-paths";

describe("session paths", () => {
  it("names a path as the repository does", () => {
    expect(normalizeSessionPath("./src/a.ts")).toBe("src/a.ts");
    expect(normalizeSessionPath("/src//a.ts")).toBe("src/a.ts");
    expect(normalizeSessionPath(" assets/logo.png ")).toBe("assets/logo.png");
  });

  it("refuses what is no path in the repository", () => {
    expect(normalizeSessionPath("")).toBeNull();
    expect(normalizeSessionPath("../secret")).toBeNull();
    expect(normalizeSessionPath("src/./a.ts")).toBeNull();
    expect(normalizeSessionPath("a/".repeat(600))).toBeNull();
  });

  it("keeps a report's distinct paths and lists the refused ones", () => {
    expect(normalizeSessionPaths(["a.ts", "./a.ts", "../b"])).toEqual({
      paths: ["a.ts"],
      refused: ["../b"],
    });
  });
});
