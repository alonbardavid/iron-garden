import { getAgentConfig } from "@lib/ai";
import { moduleLogger } from "@lib/logging";
import { transcriptsOf } from "../transcripts";
import { renderTranscripts } from "./render-transcripts";

const log = moduleLogger("review/processing/made");

/**
 * How the change was made, for a model's prompt: its transcripts' latest
 * words, up to the admin's limit (Admin > Agent config), and "(none)" when
 * it has none (no session, or nothing uploaded). Transcripts only help, so
 * ones that cannot be read leave a note instead of failing the job.
 */
export async function transcriptsText(pr: {
  id: string;
  sessionId: string | null;
}): Promise<{ text: string; count: number }> {
  try {
    const [transcripts, { maxTranscriptWords }] = await Promise.all([
      transcriptsOf(pr),
      getAgentConfig(),
    ]);
    return {
      text: renderTranscripts(transcripts, maxTranscriptWords),
      count: transcripts.length,
    };
  } catch (err) {
    log.warning("transcripts left out of the prompt", {
      pullRequestId: pr.id,
      err,
    });
    return { text: "(the transcripts could not be read)", count: 0 };
  }
}
