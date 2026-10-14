import { MAX_TRANSCRIPT_ENTRIES, transcriptEntrySchema } from "@lib/contract";
import type { TranscriptEntryRow } from "@lib/db-models";

// A transcript file: a JSON array of entries, an object with `entries`, or
// one entry per line.
export function parseTranscript(text: string): TranscriptEntryRow[] | null {
  const json = parseJson(text) ?? parseJsonLines(text);
  const list =
    json &&
    !Array.isArray(json) &&
    typeof json === "object" &&
    "entries" in json
      ? json.entries
      : json;
  const parsed = transcriptEntrySchema.array().safeParse(list);
  if (!parsed.success) {
    return null;
  }
  const entries = parsed.data;
  return entries.length > 0 && entries.length <= MAX_TRANSCRIPT_ENTRIES
    ? entries
    : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseJsonLines(text: string): unknown {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const parsed = lines.map(parseJson);
  return parsed.includes(undefined) ? undefined : parsed;
}
