import { describe, expect, it } from "vitest";
import { rulesSection } from "./prompt";

describe("rulesSection", () => {
  it("is empty without rules", () => {
    expect(rulesSection([])).toBe("");
  });

  it("lists prompt rules with their id, what to look for and their files", () => {
    const section = rulesSection([
      {
        id: "PRR_1",
        name: "Money math",
        match: {
          kind: "prompt",
          prompt: "Amounts\nand rounding",
          paths: ["api/**"],
        },
        action: "high-impact",
      },
    ]);
    expect(section).toContain("- Money math (id PRR_1), high impact");
    expect(section).toContain(
      "You judge in files matching api/**: Amounts and rounding",
    );
    expect(section).toContain('"rule": "PRR_1"');
  });

  it("describes pattern rules so auto-accepted lines stay out of groups", () => {
    const section = rulesSection([
      {
        id: "PRR_2",
        name: "Import changes",
        match: { kind: "structure", constructs: ["imports"], paths: [] },
        action: "auto-accept",
      },
      {
        id: "PRR_3",
        name: "Generated",
        match: {
          kind: "files",
          syntax: "glob",
          patterns: ["dist/**", "*.lock"],
        },
        action: "auto-accept",
      },
    ]);
    expect(section).toContain("- Import changes (id PRR_2), auto-accepted");
    expect(section).toContain(
      "all import statements, in JavaScript and TypeScript files.",
    );
    expect(section).toContain("matches the glob dist/** or *.lock.");
    expect(section).toContain(
      "Leave lines an auto-accept rule covers out of your groups",
    );
    expect(section).not.toContain('"rules": [');
  });
});
