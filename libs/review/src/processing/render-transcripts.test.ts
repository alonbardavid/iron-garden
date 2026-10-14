import { describe, expect, it } from "vitest";
import { renderTranscripts } from "./render-transcripts";

const TRANSCRIPT = {
  commitSha: "abcdef1234567890",
  entries: [
    { role: "user" as const, author: "maya", text: "Add a usage route." },
    {
      role: "agent" as const,
      text: "Added it beside credits.",
      tools: [
        { name: "Edit", target: "src/routes/usage.ts" },
        { name: "Bash", target: "pnpm test" },
      ],
    },
  ],
};

describe("renderTranscripts", () => {
  it("says when there are none, or none may go", () => {
    expect(renderTranscripts([], 1000)).toBe("(none)");
    expect(renderTranscripts([TRANSCRIPT], 0)).toBe(
      "(not sent: the transcript limit is 0 words)",
    );
  });

  it("shows who said what and the tools the agent used", () => {
    expect(renderTranscripts([TRANSCRIPT], 10_000)).toBe(
      [
        "### Transcript of commit abcdef1",
        "**Person (maya)**: Add a usage route.",
        "**Agent**: Added it beside credits.\n(used: Edit src/routes/usage.ts, Bash pnpm test)",
      ].join("\n\n"),
    );
  });

  it("keeps the latest words and counts what is left out", () => {
    // The agent's entry is 12 words, the person's 6.
    const text = renderTranscripts([TRANSCRIPT], 12);
    expect(text).toContain("**Agent**: Added it beside credits.");
    expect(text).not.toContain("Add a usage route");
    expect(text.startsWith("(1 earlier entries left out)")).toBe(true);
    expect(text).toContain("### Transcript of commit abcdef1");
  });

  it("cuts the newest entry to its last words when it alone is too long", () => {
    const text = renderTranscripts([TRANSCRIPT], 3);
    expect(text).toContain("…Bash pnpm test)");
    expect(text).toContain("(1 earlier entries left out)");
  });

  it("keeps the newest transcript over older ones", () => {
    const older = { ...TRANSCRIPT, commitSha: "1111111aaaa" };
    const text = renderTranscripts([older, TRANSCRIPT], 18);
    expect(text).toContain("### Transcript of commit abcdef1");
    expect(text).not.toContain("### Transcript of commit 1111111");
  });
});
