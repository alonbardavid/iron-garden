import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";

// The environment variable an agent keeps its key in; short, so it reads in
// a shell line. The key itself never goes in the prompt.
export const API_KEY_VARIABLE = "IG_AGENT_API_KEY";

// What to tell an agent so it starts a session on a repository: the one
// request to send, and to follow the instructions in the response.
export function sessionPrompt(origin: string, repository: string): string {
  return `Start a ${PRODUCT_DISPLAY_NAME} session on the repository "${repository}" and do the task below in it.

1. ${startRequest(origin, repository, "<one line>", "<what you will change and why>")}

2. The response has "git" (a remote and a token for your own session repository) and "instructions". Follow the instructions: work on a branch, push it, open a pull request, and split the change into brackets for review with the prompt the pull request returns.

Task: <describe the task here>`;
}

// What to tell an agent so it brings a branch it already has, and the pull
// request for it, into review here: a session only to push the branch as it
// is and open the pull request.
export function importPrompt(origin: string, repository: string): string {
  return `Import a pull request into ${PRODUCT_DISPLAY_NAME} for review, on the repository "${repository}". The branch and its pull request already exist: do not change the code, only push the branch as it is and open the pull request here.

1. ${startRequest(origin, repository, "<the pull request's title>", "<the pull request's description>")}

2. The response has "git" (a remote and a token for your own session repository) and "instructions". Add the session repository as a remote the way the instructions say, then push the existing branch to it unchanged: git push session <branch>. Make no new commits and no new branch.

3. Open the pull request: POST the response's "links.pullRequests" URL, with the same key, with JSON {"branch": "<branch>", "title": "<the pull request's title>", "description": "<the pull request's description>"}. If its response carries a grouping prompt, follow it to split the change into brackets for review.

Branch: <the branch to import>`;
}

// The one request that starts a session, with the key read from its
// variable.
function startRequest(
  origin: string,
  repository: string,
  title: string,
  goal: string,
): string {
  return `Start the session with one request. Your agent API key is in the ${API_KEY_VARIABLE} environment variable; use the variable, never the key itself:

   curl -sS -X POST ${origin}/api/sessions \\
     -H "Authorization: Bearer $${API_KEY_VARIABLE}" \\
     -H "Content-Type: application/json" \\
     -d '{"repository": "${repository}", "client": "<what you are, such as claude-code or codex>", "title": "${title}", "goal": "${goal}"}'`;
}
