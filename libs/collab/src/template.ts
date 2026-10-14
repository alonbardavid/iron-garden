// The conditions an agent prompt may test with {{#if name}}…{{else}}…{{/if}},
// with what each means.
export const PROMPT_CONDITIONS = {
  claude:
    "The agent is Claude: it named itself so when it started its session, or its requests say so",
  serverGroups:
    "This server groups pull requests (Admin > Agent config), so the agent gets no grouping prompt and cannot send groups",
} as const;

export type PromptFlags = Partial<
  Record<keyof typeof PROMPT_CONDITIONS, boolean>
>;

// A block tag alone on its line takes the line with it, so templates can put
// tags on lines of their own.
const LONE_TAG = /^[ \t]*(\{\{\s*(?:#if\s+\w+|else|\/if)\s*\}\})[ \t]*\n/gm;
// An {{#if}} block with no other {{#if}} inside: the innermost first.
const INNERMOST_IF =
  /\{\{\s*#if\s+(\w+)\s*\}\}((?:(?!\{\{\s*#if\s)[\s\S])*?)\{\{\s*\/if\s*\}\}/;
const ELSE = /\{\{\s*else\s*\}\}/;

// Keeps the branches whose condition holds (an unknown condition is false),
// then fills {{placeholder}} slots. Unknown placeholders are left as
// written, so an admin's typo shows up in the prompt instead of vanishing.
export function renderTemplate(
  template: string,
  values: Record<string, string>,
  flags: Record<string, boolean | undefined> = {},
): string {
  let text = template.replace(LONE_TAG, "$1");
  for (
    let block = INNERMOST_IF.exec(text);
    block;
    block = INNERMOST_IF.exec(text)
  ) {
    const [whole, name, body] = block as unknown as [string, string, string];
    const [then, otherwise = ""] = body.split(ELSE);
    text =
      text.slice(0, block.index) +
      (flags[name] ? then : otherwise) +
      text.slice(block.index + whole.length);
  }
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (slot, name: string) =>
    Object.hasOwn(values, name) ? values[name]! : slot,
  );
}

// Whether a session's client is Claude: what the agent named itself when it
// started the session, or else the user agent of that request.
export function isClaude(client: string | null | undefined): boolean {
  return /claude/i.test(client ?? "");
}
