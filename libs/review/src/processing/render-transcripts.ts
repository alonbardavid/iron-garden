import type { TranscriptEntryRow } from "@lib/db-models";

export interface TranscriptForModel {
  commitSha: string | null;
  entries: TranscriptEntryRow[];
}

/**
 * The conversations in which an agent made the change, as the server's model
 * reads them: who said what, and the tools the agent used. Only the latest
 * `maxWords` words go, whole entries back from the newest (the newest cut to
 * its last words when it alone is longer); what is left out is counted.
 */
export function renderTranscripts(
  transcripts: TranscriptForModel[],
  maxWords: number,
): string {
  if (transcripts.length === 0) {
    return "(none)";
  }
  if (maxWords <= 0) {
    return "(not sent: the transcript limit is 0 words)";
  }
  const kept: { transcript: number; text: string }[] = [];
  let words = 0;
  const total = transcripts.reduce((n, t) => n + t.entries.length, 0);
  outer: for (let t = transcripts.length - 1; t >= 0; t--) {
    const entries = transcripts[t]!.entries;
    for (let e = entries.length - 1; e >= 0; e--) {
      const text = renderEntry(entries[e]!);
      const count = wordCount(text);
      if (words + count > maxWords) {
        if (kept.length === 0) {
          kept.unshift({ transcript: t, text: lastWords(text, maxWords) });
        }
        break outer;
      }
      kept.unshift({ transcript: t, text });
      words += count;
    }
  }
  const lines: string[] = [];
  if (kept.length < total) {
    lines.push(`(${total - kept.length} earlier entries left out)`);
  }
  let heading = -1;
  for (const { transcript, text } of kept) {
    if (transcript !== heading) {
      heading = transcript;
      lines.push(headingOf(transcripts[transcript]!));
    }
    lines.push(text);
  }
  return lines.join("\n\n");
}

function headingOf(transcript: TranscriptForModel): string {
  return `### Transcript of commit ${transcript.commitSha?.slice(0, 7) ?? "(uncommitted)"}`;
}

function renderEntry(entry: TranscriptEntryRow): string {
  const who =
    entry.role === "user"
      ? `**Person${entry.author ? ` (${entry.author})` : ""}**`
      : "**Agent**";
  const tools = entry.tools?.length
    ? `\n(used: ${entry.tools.map((t) => `${t.name} ${t.target}`.trim()).join(", ")})`
    : "";
  return `${who}: ${entry.text}${tools}`;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function lastWords(text: string, count: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  return `…${words.slice(-count).join(" ")}`;
}
