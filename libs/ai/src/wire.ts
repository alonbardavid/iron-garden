// How a chat goes over the AI binding for each kind of model. Workers AI
// models (@cf/…) take a messages list with JSON mode. Anthropic's, which AI
// Gateway routes to Anthropic (anthropic/…), take the Anthropic Messages
// shape: the system prompt apart from the turns, and no JSON mode, so their
// prompt asking for JSON only is what keeps the answer JSON.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const ANTHROPIC = "anthropic/";

export function requestBody(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): object {
  if (!model.startsWith(ANTHROPIC)) {
    return {
      messages,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    };
  }
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  return {
    ...(system ? { system } : {}),
    messages: messages.filter((message) => message.role !== "system"),
    max_tokens: maxTokens,
  };
}

// Workers AI answers { response }, which JSON mode may already have parsed;
// models served in the OpenAI shape answer { choices }; Anthropic's answer
// { content } blocks, of which only the text counts (not their thinking).
export function answerText(result: unknown): string {
  const { response, choices, content } = (result ?? {}) as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
    content?: { type?: string; text?: unknown }[];
  };
  const answer = response ?? choices?.[0]?.message?.content ?? textOf(content);
  if (answer === undefined || answer === null) {
    throw new Error("The model returned no answer");
  }
  return typeof answer === "string" ? answer : JSON.stringify(answer);
}

function textOf(
  content: { type?: string; text?: unknown }[] | undefined,
): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  const texts = content.flatMap((block) =>
    block.type === "text" && typeof block.text === "string" ? [block.text] : [],
  );
  return texts.length > 0 ? texts.join("") : undefined;
}
