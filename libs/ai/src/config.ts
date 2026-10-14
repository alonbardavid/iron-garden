import { getBindings } from "@lib/capabilities";
import { getDb, instanceSettings, newEntityId, eq } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import { DEFAULT_MAX_TRANSCRIPT_WORDS, DEFAULT_MODEL } from "./defaults";

export {
  DEFAULT_GATEWAY,
  DEFAULT_MAX_TRANSCRIPT_WORDS,
  DEFAULT_MODEL,
} from "./defaults";

const log = moduleLogger("ai/config");

const AGENT_CONFIG_KEY = "agent.config";

export const PROCESSING_MODES = ["agent", "server"] as const;
export type ProcessingMode = (typeof PROCESSING_MODES)[number];

export interface AgentConfigInput {
  // Who groups a new pull request: its agent, or the model on the server.
  processing: ProcessingMode;
  model: string;
  // The AI Gateway id model calls go through; null for DEFAULT_GATEWAY.
  gateway: string | null;
  // The most words of the agent's transcripts a prompt carries, the latest
  // ones; 0 sends none.
  maxTranscriptWords: number;
}

export interface AgentConfig extends AgentConfigInput {
  updatedAt: number | null;
}

const DEFAULTS: AgentConfigInput = {
  processing: "agent",
  model: DEFAULT_MODEL,
  gateway: null,
  maxTranscriptWords: DEFAULT_MAX_TRANSCRIPT_WORDS,
};

export async function getAgentConfig(): Promise<AgentConfig> {
  const [row] = await getDb()
    .select()
    .from(instanceSettings)
    .where(eq(instanceSettings.key, AGENT_CONFIG_KEY));
  return {
    ...DEFAULTS,
    ...(row ? parse(row.value) : {}),
    updatedAt: row?.updatedAt.getTime() ?? null,
  };
}

export async function setAgentConfig(
  userId: string,
  input: AgentConfigInput,
): Promise<AgentConfig> {
  const value = JSON.stringify(input);
  await getDb()
    .insert(instanceSettings)
    .values({
      id: newEntityId("INSTANCE_SETTING"),
      key: AGENT_CONFIG_KEY,
      value,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: instanceSettings.key,
      set: { value, updatedBy: userId, updatedAt: new Date() },
    });
  log.info("agent config saved", { userId, processing: input.processing });
  return getAgentConfig();
}

// Whether new pull requests are grouped on the server: the admin turned it on
// and this deployment has the bindings for it. Losing a binding falls back to
// agents grouping their own pull requests.
export async function groupsOnServer(): Promise<boolean> {
  return getBindings().ai && (await getAgentConfig()).processing === "server";
}

// A stored value from an older shape keeps whatever still parses.
function parse(value: string): Partial<AgentConfigInput> {
  try {
    const stored = JSON.parse(value) as Partial<AgentConfigInput>;
    return {
      ...(PROCESSING_MODES.includes(stored.processing as ProcessingMode)
        ? { processing: stored.processing }
        : {}),
      ...(typeof stored.model === "string" && stored.model
        ? { model: stored.model }
        : {}),
      ...(typeof stored.gateway === "string" && stored.gateway
        ? { gateway: stored.gateway }
        : {}),
      ...(Number.isInteger(stored.maxTranscriptWords) &&
      stored.maxTranscriptWords! >= 0
        ? { maxTranscriptWords: stored.maxTranscriptWords }
        : {}),
    };
  } catch (err) {
    log.warning("stored agent config is not JSON; using defaults", { err });
    return {};
  }
}
