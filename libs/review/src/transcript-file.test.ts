import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcript-file";

const prompt = { role: "user", author: "Maya", text: "Add usage" };
const answer = {
  role: "agent",
  text: "Done.",
  tools: [{ name: "Edit", target: "src/a.ts" }],
};

describe("parseTranscript", () => {
  it.each([
    ["an array", JSON.stringify([prompt, answer])],
    ["an object with entries", JSON.stringify({ entries: [prompt, answer] })],
    [
      "one entry per line",
      `${JSON.stringify(prompt)}\n${JSON.stringify(answer)}\n`,
    ],
  ])("reads %s", (_, text) => {
    expect(parseTranscript(text)).toEqual([prompt, answer]);
  });

  it.each([
    ["prose", "not a transcript"],
    ["an empty list", "[]"],
    ["an entry without a role", JSON.stringify([{ text: "hi" }])],
  ])("refuses %s", (_, text) => {
    expect(parseTranscript(text)).toBeNull();
  });
});
