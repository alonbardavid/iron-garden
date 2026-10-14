import { expect, it } from "vitest";
import { DEFAULT_GROUPING_PROMPT } from "./default-prompt";
import { DEFAULT_SERVER_GROUPING_PROMPT } from "./processing/default-server-prompt";
import { PROMPT_PLACEHOLDERS } from "./placeholders";

it.each([
  ["agent", DEFAULT_GROUPING_PROMPT],
  ["server", DEFAULT_SERVER_GROUPING_PROMPT],
] as const)(
  "uses only placeholders the platform fills in the default %s prompt",
  (kind, prompt) => {
    const used = [...prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    expect(new Set(used)).toEqual(
      new Set(Object.keys(PROMPT_PLACEHOLDERS[kind])),
    );
  },
);
