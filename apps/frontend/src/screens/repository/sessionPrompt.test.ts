import { describe, expect, it } from "vitest";
import { API_KEY_VARIABLE, sessionPrompt } from "./sessionPrompt";

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
