import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_PROMPT,
  SESSION_PROMPT_PLACEHOLDERS,
} from "./default-session-prompt";
import { renderTemplate } from "./template";

describe("the default session prompt", () => {
  it("uses only placeholders the platform fills", () => {
    const used = [...DEFAULT_SESSION_PROMPT.matchAll(/\{\{(\w+)\}\}/g)]
      .map((m) => m[1])
      .filter((name) => name !== "else");
    expect(new Set(used)).toEqual(
      new Set(Object.keys(SESSION_PROMPT_PLACEHOLDERS)),
    );
  });

  it("tells the agent not to group when the server does", () => {
    const server = renderTemplate(
      DEFAULT_SESSION_PROMPT,
      {},
      { serverGroups: true },
    );
    const agent = renderTemplate(DEFAULT_SESSION_PROMPT, {}, {});
    expect(server).toContain("That is not your job here");
    expect(server).not.toContain("grouping.prompt");
    expect(agent).toContain("grouping.prompt");
    expect(agent).not.toContain("That is not your job here");
  });

  it("asks Claude for an outline and other agents for their transcript", () => {
    const claude = renderTemplate(DEFAULT_SESSION_PROMPT, {}, { claude: true });
    const other = renderTemplate(DEFAULT_SESSION_PROMPT, {}, {});
    expect(claude).toContain("## 4. Outline how you made each commit");
    expect(claude).not.toContain("Share your transcript");
    expect(other).toContain("## 4. Share your transcript");
    expect(other).not.toContain("Outline how you made");
    expect(claude).not.toMatch(/\{\{\s*(#if|else|\/if)/);
  });

  it("offers every agent both a socket and polling for chat", () => {
    for (const rendered of [
      renderTemplate(DEFAULT_SESSION_PROMPT, {}, { claude: true }),
      renderTemplate(DEFAULT_SESSION_PROMPT, {}, {}),
    ]) {
      expect(rendered).toContain("chat.socketUrl");
      expect(rendered).toContain("every 25 seconds");
    }
  });
});
