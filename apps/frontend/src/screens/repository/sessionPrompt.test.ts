import { describe, expect, it } from "vitest";
import { API_KEY_VARIABLE, importPrompt, sessionPrompt } from "./sessionPrompt";

describe("sessionPrompt", () => {
  const prompt = sessionPrompt("https://forge.example", "platform");

  it("names the request to send and the repository", () => {
    expect(prompt).toContain("-X POST https://forge.example/api/sessions");
    expect(prompt).toContain('"repository": "platform"');
  });

  it("refers to the API key by its variable only", () => {
    expect(prompt).toContain(`Bearer $${API_KEY_VARIABLE}`);
    expect(prompt).not.toMatch(/cgit_(pat|agt)_/);
  });
});

describe("importPrompt", () => {
  const prompt = importPrompt("https://forge.example", "platform");

  it("starts a session on the repository, with the key by its variable", () => {
    expect(prompt).toContain("-X POST https://forge.example/api/sessions");
    expect(prompt).toContain('"repository": "platform"');
    expect(prompt).toContain(`Bearer $${API_KEY_VARIABLE}`);
  });

  it("pushes the existing branch unchanged and opens its pull request", () => {
    expect(prompt).toContain("git push session <branch>");
    expect(prompt).toContain("do not change the code");
    expect(prompt).toContain('"links.pullRequests"');
  });
});
