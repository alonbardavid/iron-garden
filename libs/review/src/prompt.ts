import { promptSetting, type StoredPrompt } from "@lib/collab";
import { DEFAULT_GROUPING_PROMPT } from "./default-prompt";
import { DEFAULT_SERVER_GROUPING_PROMPT } from "./processing/default-server-prompt";
import type { PromptKind } from "./placeholders";

export type ProcessingPrompt = StoredPrompt;

// The built-in processing prompt for each way of processing.
const DEFAULT_PROMPTS: Record<PromptKind, string> = {
  agent: DEFAULT_GROUPING_PROMPT,
  server: DEFAULT_SERVER_GROUPING_PROMPT,
};

// One prompt for processing pull requests, whoever processes them. While no
// admin has written one, it is the built-in default of the way they are
// processed; a written one is kept as is when that changes.
const stored = promptSetting("review.groupingPrompt", "");

export async function getProcessingPrompt(
  kind: PromptKind,
): Promise<ProcessingPrompt> {
  const saved = await stored.get();
  const defaultPrompt = DEFAULT_PROMPTS[kind];
  return {
    ...saved,
    prompt: saved.isDefault ? defaultPrompt : saved.prompt,
    defaultPrompt,
  };
}

export async function setProcessingPrompt(
  userId: string,
  kind: PromptKind,
  prompt: string,
): Promise<ProcessingPrompt> {
  await stored.set(userId, prompt);
  return getProcessingPrompt(kind);
}

export async function restoreDefaultProcessingPrompt(
  userId: string,
  kind: PromptKind,
): Promise<ProcessingPrompt> {
  await stored.restoreDefault(userId);
  return getProcessingPrompt(kind);
}
