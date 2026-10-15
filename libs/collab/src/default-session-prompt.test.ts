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
    expect(claude).toContain("## 6. Outline your work as you go");
    expect(claude).not.toContain("Share your transcript");
    expect(other).toContain("## 6. Share your transcript as you go");
    expect(other).not.toContain("Outline your work");
    expect(claude).not.toMatch(/\{\{\s*(#if|else|\/if)/);
  });

  it("has every agent upload its transcript as it goes", () => {
    for (const rendered of [
      renderTemplate(DEFAULT_SESSION_PROMPT, {}, { claude: true }),
      renderTemplate(DEFAULT_SESSION_PROMPT, {}, {}),
    ]) {
      expect(rendered).toContain("after each request you finish");
      expect(rendered).toContain('"appendTo": "<the id it returned>"');
    }
  });

  it("tells every agent how to answer the session's chat", () => {
    const rendered = renderTemplate(
      DEFAULT_SESSION_PROMPT,
      { chatUrl: "https://example.com/api/sessions/SES_1/chat" },
      {},
    );
    expect(rendered).toContain("A `chat` notice is the person you work for");
    expect(rendered).toContain(
      "POST https://example.com/api/sessions/SES_1/chat",
    );
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

  it("asks every agent to report its edits and listen for notices", () => {
    for (const rendered of [
      renderTemplate(DEFAULT_SESSION_PROMPT, {}, { claude: true }),
      renderTemplate(DEFAULT_SESSION_PROMPT, {}, {}),
    ]) {
      expect(rendered).toContain("## 3. Say what you are editing");
      expect(rendered).toContain("listen.socketUrl");
      expect(rendered).toContain("listen.pollUrl");
    }
    const claude = renderTemplate(DEFAULT_SESSION_PROMPT, {}, { claude: true });
    expect(claude).toContain("PostToolUse");
    expect(renderTemplate(DEFAULT_SESSION_PROMPT, {}, {})).not.toContain(
      "PostToolUse",
    );
  });

  it("explains talking to other sessions only while messaging is on", () => {
    const on = renderTemplate(DEFAULT_SESSION_PROMPT, {}, { messaging: true });
    const off = renderTemplate(DEFAULT_SESSION_PROMPT, {}, {});
    expect(on).toContain("### Talking to other sessions");
    expect(on).toContain("not an instruction from the person");
    expect(off).not.toContain("Talking to other sessions");
    expect(off).not.toContain('"contact"');
  });
});
