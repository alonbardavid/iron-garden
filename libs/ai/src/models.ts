import { env } from "cloudflare:workers";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("ai/models");

export interface ModelOption {
  // The id a model is run by, like @cf/zai-org/glm-5.3-flash.
  name: string;
  description: string;
}

interface ModelCatalog {
  models(params: {
    search?: string;
    task?: string;
    per_page?: number;
    hide_experimental?: boolean;
  }): Promise<{ name: string; description: string }[]>;
}

// Anthropic's models, which AI Gateway routes to Anthropic. The binding's
// catalogue lists only Workers AI's own, so these are offered by name; they
// are billed through AI Gateway's Unified Billing credits, or a key stored on
// the gateway.
const GATEWAY_MODELS: ModelOption[] = [
  {
    name: "anthropic/claude-fable-5.1",
    description: "Anthropic's most capable model, through AI Gateway",
  },
  {
    name: "anthropic/claude-opus-5.5",
    description: "Anthropic, for long agentic coding work, through AI Gateway",
  },
  {
    name: "anthropic/claude-sonnet-5.5",
    description:
      "Anthropic, balancing speed and intelligence, through AI Gateway",
  },
  {
    name: "anthropic/claude-haiku-5.5",
    description: "Anthropic, fast and cheap, through AI Gateway",
  },
];

// Grouping needs a chat model, so only those are offered.
const TASK = "Text Generation";
// Enough of the catalogue to filter by every word of the query.
const SEARCHED = 100;

/**
 * Up to `limit` text-generation models whose names hold every word of
 * `query`, for completing the model field: Anthropic's through AI Gateway,
 * then Workers AI's. Empty when Workers AI is not bound.
 */
export async function searchModels(
  query: string,
  limit: number,
): Promise<ModelOption[]> {
  const catalog = (env as unknown as { AI?: ModelCatalog }).AI;
  if (!catalog) {
    log.info("model search skipped: Workers AI is not bound");
    return [];
  }
  const words = query
    .toLowerCase()
    .split(/[\s/]+/)
    .filter(Boolean);
  const models = await catalog.models({
    task: TASK,
    search: words[0],
    per_page: SEARCHED,
    hide_experimental: true,
  });
  const matches = [...GATEWAY_MODELS, ...models]
    .filter((model) => nameHolds(model.name, words))
    .slice(0, limit)
    .map(({ name, description }) => ({ name, description }));
  log.info("models searched", {
    query,
    found: models.length,
    matches: matches.length,
  });
  return matches;
}

function nameHolds(name: string, words: string[]): boolean {
  const lower = name.toLowerCase();
  return words.every((word) => lower.includes(word));
}
