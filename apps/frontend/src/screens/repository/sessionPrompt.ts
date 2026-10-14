import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";

// The environment variable the prompt tells an agent to read its key from;
// the key itself never goes in the prompt.
// The environment variable an agent keeps its key in; short, so it reads in
// a shell line.
export const API_KEY_VARIABLE = "IG_AGENT_API_KEY";

// What to tell an agent so it starts a session on a repository: the one
// request to send, and to follow the instructions in the response.
export function sessionPrompt(origin: string, repository: string): string {
  return `Start a ${PRODUCT_DISPLAY_NAME} session on the repository "${repository}" and do the task below in it.

1. Start the session with one request. Your agent API key is in the ${API_KEY_VARIABLE} environment variable; use the variable, never the key itself:

   curl -sS -X POST ${origin}/api/sessions \\
     -H "Authorization: Bearer $${API_KEY_VARIABLE}" \\
     -H "Content-Type: application/json" \\
     -d '{"repository": "${repository}", "client": "<what you are, such as claude-code or codex>", "title": "<one line>", "goal": "<what you will change and why>"}'

2. The response has "git" (a remote and a token for your own session repository) and "instructions". Follow the instructions: work on a branch, push it, open a pull request, and split the change into brackets for review with the prompt the pull request returns.

Task: <describe the task here>`;
}
