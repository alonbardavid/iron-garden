import { describe, expect, it } from "vitest";
import {
  codePath,
  historyPath,
  joinPath,
  normalizePath,
  parentOf,
  pathPrefixes,
  resolvePath,
} from "./paths";

describe("code paths", () => {
  it("links a path and ref with slashes readable, and the root bare", () => {
    expect(codePath("app", "src/main.ts")).toBe("/r/app?path=src/main.ts");
    expect(codePath("app", "src", "feature/x")).toBe(
      "/r/app?ref=feature/x&path=src",
    );
    expect(codePath("app", "")).toBe("/r/app");
  });

  it("links history pages counting from one", () => {
    expect(historyPath("app")).toBe("/r/app/commits");
    expect(historyPath("app", "dev", 1)).toBe("/r/app/commits?ref=dev&page=2");
  });

  it("joins, normalizes and expands paths", () => {
    expect(joinPath("", "src")).toBe("src");
    expect(joinPath("src", "main.ts")).toBe("src/main.ts");
    expect(parentOf("src/lib/a.ts")).toBe("src/lib");
    expect(parentOf("a.ts")).toBe("");
    expect(normalizePath("/src//main.ts/")).toBe("src/main.ts");
    expect(pathPrefixes("a/b/c.ts")).toEqual(["a", "a/b", "a/b/c.ts"]);
    expect(pathPrefixes("")).toEqual([]);
  });
});

describe("resolvePath", () => {
  it("resolves a link against the file's folder", () => {
    expect(resolvePath("docs", "guide.md")).toBe("docs/guide.md");
    expect(resolvePath("docs", "./img/a.png")).toBe("docs/img/a.png");
    expect(resolvePath("docs/api", "../../README.md#usage")).toBe("README.md");
    expect(resolvePath("docs", "/src/main.ts?plain=1")).toBe("src/main.ts");
    expect(resolvePath("", "../../x")).toBe("x");
  });

  it("leaves links out of the repository and in-page anchors alone", () => {
    expect(resolvePath("", "https://example.com/a.png")).toBeNull();
    expect(resolvePath("", "//cdn.example.com/a.png")).toBeNull();
    expect(resolvePath("", "mailto:me@example.com")).toBeNull();
    expect(resolvePath("", "#usage")).toBeNull();
  });
});
