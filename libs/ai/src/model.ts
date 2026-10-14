import { env } from "cloudflare:workers";
import { moduleLogger } from "@lib/logging";
import type { AgentConfig } from "./config";
import { DEFAULT_GATEWAY } from "./defaults";
import { answerText, requestBody, type ChatMessage } from "./wire";

export type { ChatMessage } from "./wire";

const log = moduleLogger("ai/model");

// The binding's run() is typed per model name; an admin can pick any model.
interface AiBinding {
  run(
    model: string,
    input: object,
    options?: { gateway?: { id: string } },
  ): Promise<unknown>;
}

const MAX_OUTPUT_TOKENS = 32_000;

/**
 * One chat completion that answers with a JSON object, through the config's
 * AI Gateway (DEFAULT_GATEWAY when it names none): a Workers AI model, or a
 * provider's model the gateway routes to. Returns the model's text.
 */
export async function completeJson(
  config: Pick<AgentConfig, "model" | "gateway">,
  messages: ChatMessage[],
): Promise<string> {
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai) {
    throw new Error("Workers AI is not bound on this deployment");
  }
  const gateway = config.gateway ?? DEFAULT_GATEWAY;
  const started = Date.now();
  const result = await ai.run(
    config.model,
    requestBody(config.model, messages, MAX_OUTPUT_TOKENS),
    { gateway: { id: gateway } },
  );
  const text = answerText(result);
  log.info("model answered", {
    model: config.model,
    gateway,
    ms: Date.now() - started,
    chars: text.length,
  });
  return text;
}
