import { describe, expect, it } from "vitest";
import { isClaude, renderTemplate } from "./template";

describe("renderTemplate", () => {
  it("fills known placeholders and keeps unknown ones visible", () => {
    expect(
      renderTemplate("#{{number}} in {{ repository }}: {{typo}}", {
        number: "7",
        repository: "platform",
      }),
    ).toBe("#7 in platform: {{typo}}");
  });

  it("does not expand placeholders that appear inside values", () => {
    expect(
      renderTemplate("{{title}}", { title: "{{number}}", number: "1" }),
    ).toBe("{{number}}");
  });

  it("keeps the branch whose condition holds", () => {
    const template = "A{{#if claude}}B{{else}}C{{/if}}D";
    expect(renderTemplate(template, {}, { claude: true })).toBe("ABD");
    expect(renderTemplate(template, {}, { claude: false })).toBe("ACD");
    expect(renderTemplate(template, {})).toBe("ACD");
  });

  it("drops the lines of tags that stand alone, and nests", () => {
    const template = [
      "start",
      "{{#if claude}}",
      "claude {{name}}",
      "{{#if other}}",
      "both",
      "{{/if}}",
      "{{else}}",
      "anyone",
      "{{/if}}",
      "end",
      "",
    ].join("\n");
    expect(renderTemplate(template, { name: "x" }, { claude: true })).toBe(
      "start\nclaude x\nend\n",
    );
    expect(renderTemplate(template, {}, { claude: true, other: true })).toBe(
      "start\nclaude {{name}}\nboth\nend\n",
    );
    expect(renderTemplate(template, {})).toBe("start\nanyone\nend\n");
  });
});

describe("isClaude", () => {
  it.each([
    ["claude-code", true],
    ["Claude Code/2.1 (cli)", true],
    ["codex", false],
    ["curl/8.5.0", false],
    [null, false],
  ])("%s → %s", (client, expected) => {
    expect(isClaude(client)).toBe(expected);
  });
});
