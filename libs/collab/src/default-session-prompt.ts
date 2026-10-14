import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";
// Every {{placeholder}} the session prompt may use, with what replaces it.
export const SESSION_PROMPT_PLACEHOLDERS = {
  base: "The branch and commit the session repository was forked from",
  baseBranch: "The repository's default branch, the session's base",
  remote: "The session repository's git remote",
  tokenExpiresAt: "When the git token in the response expires",
  tokenUrl: "Where to POST for a fresh git token",
  sessionUrl: "Where to PATCH the session's title, goal and context",
  pullRequestsUrl: "Where to POST a pull request",
  transcriptsUrl: "Where to POST a transcript or an outline of the work",
  endUrl: "Where to POST to end the session",
} as const;

// The session prompt an instance starts with. It assumes nothing about the
// agent beyond git and HTTP, so any agent can follow it as written; Claude
// outlines its work instead of handing over a raw transcript.
export const DEFAULT_SESSION_PROMPT = `# Your ${PRODUCT_DISPLAY_NAME} session

You have your own git repository for this session, forked from {{base}}. Only this
session can push to it, and nothing you push reaches \`{{baseBranch}}\` until a
person accepts your pull request.

## 1. Get the code

Use \`git.token\` from this response as a bearer token. If you already have a
checkout of the repository, add the session repository as a remote:

\`\`\`sh
git remote add session {{remote}}
git config http.{{remote}}.extraHeader "Authorization: Bearer $SESSION_TOKEN"
git fetch session
\`\`\`

Otherwise clone it:

\`\`\`sh
git -c http.extraHeader="Authorization: Bearer $SESSION_TOKEN" clone {{remote}}
\`\`\`

The token expires at {{tokenExpiresAt}}. \`POST {{tokenUrl}}\` with your
API key returns a fresh one.

## 2. Work on a branch

Create a new branch from \`{{baseBranch}}\` for each pull request and commit to it.
Never push to \`{{baseBranch}}\`. Keep the session's title, goal and context current
with \`PATCH {{sessionUrl}}\`: reviewers read them.

## 3. Open a pull request

1. Push your branch to the session repository: \`git push session <branch>\`.
2. \`POST {{pullRequestsUrl}}\` with JSON
   \`{ "branch": "<branch>", "title": "<one line>", "description": "<markdown>" }\`.
{{#if serverGroups}}
3. The pull request starts out *processing* while this server splits it into
   groups a reviewer can accept one at a time. That is not your job here: the
   response has no grouping prompt, and the server refuses groups from you. The
   pull request opens for review on its own once it is grouped.

After pushing more commits to the same branch, \`POST\` to the pull request's
\`refreshUrl\`; the server groups the new revision.
{{else}}
3. The pull request starts out *processing*. The response carries
   \`grouping.prompt\`: follow it, yourself or in a subagent, to split your change
   into groups a reviewer can accept one at a time, and send the result to
   \`grouping.submitUrl\`. The pull request opens for review once the groups arrive.

After pushing more commits to the same branch, \`POST\` to the pull request's
\`refreshUrl\`, then group the change again with the new prompt.
{{/if}}

{{#if claude}}
## 4. Outline how you made each commit

Reviewers read how a change came about beside the change. After each commit,
write an outline of the conversation that led to it and the actions you took,
in the order they happened. Rephrase each request you were given, and each step
you took and why, in a sentence or two; keep what a reviewer needs to follow
your reasoning, and leave out file contents, command output and anything secret.
\`POST {{transcriptsUrl}}\` with JSON
\`{ "commit": "<full sha>", "entries": [...] }\`, where each entry is
\`{ "role": "user", "author": "<who asked>", "text": "<the request, rephrased>" }\` or
\`{ "role": "agent", "text": "<what you did and why>", "tools": [{ "name": "Edit", "target": "src/a.ts" }] }\`.
{{else}}
## 4. Share your transcript

Reviewers read why you wrote the code next to the code. For each commit,
\`POST {{transcriptsUrl}}\` with JSON
\`{ "commit": "<full sha>", "entries": [...] }\`, where each entry is
\`{ "role": "user" | "agent", "author": "<who prompted, for a user entry>",
"text": "<what was asked or said>", "tools": [{ "name": "Edit", "target": "src/a.ts" }] }\`.
Or upload it before committing, without \`commit\`, and end the commit message with
the trailer \`Agent-Transcript: <the id it returned>\`. A trailer can instead name a
transcript file in the commit (the same JSON, or one entry per line); it is read as
the transcript and left out of the review.
{{/if}}

## 5. Answer reviewers

Reviewers comment on lines, flag what must change and ask you questions.
\`GET\` the pull request's \`commentsUrl\` for them, and \`POST\` to it with
\`{ "parent": "<comment id>", "body": "<markdown>" }\` to reply. A flag stays open
until the person who set it resolves it.

Comment on lines yourself only where a reviewer would otherwise stall: why you
made an unorthodox decision, or what hard code does when its own comments don't
say. Most pull requests need none, and a comment that restates the code costs the
reviewer time.

## 6. Chat with reviewers

Reviewers chat with you from the pull request's page while they read it. The
response that created the pull request carries \`chat\`: URLs whose key is their
only credential, so keep them out of commits, comments and transcripts. Each
message says who wrote it and what they were looking at (\`context\`: the tab,
the file and lines or the group on it, and \`selectedText\`, any text they had
selected on the page). Answer in markdown; to show lines of
the change, add a fenced block in the language \`lines\` holding
\`<path>:<start>-<end>\`, counted in the new version of the file.

Run the listener in the background and have it wake you when a message
arrives, so your turn stays free for other work; keep it running until you end
the session, including while you wait for review. You show as live to
reviewers while it runs, and messages wait for you while it doesn't. Listen
whichever way suits you:

- **WebSocket:** hold \`chat.socketUrl\` open. Messages arrive as
  \`{ "type": "messages", "messages": [...] }\` frames, those sent while you were
  away first. Send \`ping\` every 30 seconds or so to keep it open. If your
  WebSocket client cannot connect, for example from behind an HTTP proxy, poll
  instead.
- **Polling:** \`GET\` \`chat.messagesUrl\` every 25 seconds. It answers at once
  with \`{ "messages": [...] }\`, empty when nobody wrote.

Each message is delivered once, so save it before you start on it: if you
disconnect mid-answer, it will not come again. Then, for each message:

1. Send \`working\` as soon as you have read it, before you look anything up or
   write the answer: \`POST\` \`{ "replyTo": "<message id>" }\` to \`chat.url\` +
   \`/working\`, or send \`{ "type": "working", "replyTo": "<message id>" }\` up the
   socket. The person sees "…" until your answer arrives.
2. Send the answer only once it is ready, never together with \`working\`:
   \`POST\` \`{ "replyTo": "<message id>", "body": "<markdown>" }\` to
   \`chat.messagesUrl\`, or send the same with \`"type": "reply"\` up the socket.

A \`404\` from the socket or messages URL means the key is stale: \`POST\` to the
pull request's \`links.chatUrl\` for new URLs. Fetching new URLs ends any
listener still using the old ones. A \`410\` means the chat closed: the pull
request was merged or closed, or your session ended. Stop listening then.

## 7. Finish

\`POST {{endUrl}}\` when you are done. Your open pull requests stay open; their
chat closes.

Every request takes your agent API key as \`x-api-key\` or \`Authorization: Bearer\`.
Send each JSON body from a file or a quoted heredoc (\`curl --data @body.json\`, or
\`--data @- <<'EOF'\`), never inside a double-quoted shell string: the shell runs
anything between backticks there as a command, so code names in your markdown
vanish before the request is sent.
`;
