# Architecture

The full design is in [specs/architecture.md](specs/architecture.md); this page is the map of
the code as it is.

## Layout

```
apps/
  backend/         Hono on Cloudflare Workers: the API, the git proxy, and the SPA's assets
  frontend/        the SPA, admin pages included (served at /)
libs/
  contract/        oRPC API contract shared by backend + frontend
  db-models/       Drizzle schema + D1 helpers, prefixed entity ids
  identity/        better-auth (users, admin, API keys), agents, principals, first-run setup
  forge/           repositories, members, agent access, authorization, the git proxy
  collab/          agent sessions, their Artifacts forks, the session prompt and prompt templates
  review/          pull requests, changed files, groups, the processing prompt and server-side grouping, accepted changes
  ai/              Workers AI, queuing processing jobs and the sandbox loader; the agent config
  github/          GitHub tokens, repositories mirrored from GitHub, workflow runs, webhooks
  diff/            the line diff and its changes, shared by the worker and the SPA (see its README)
  git-host/        the Artifacts binding behind a small interface; tree diffs
  capabilities/    which optional bindings (email, git, ai) this deployment has, and email's settings
  email-ds/        react-email layout and rendering
  email-service/   sendEmail over the send_email binding, the admin's test email
  ds/              design system / theme, incl. the form primitives
  logging/         LogTape configuration + moduleLogger (see its README)
  server-commons/  shared server middleware (errors, request logging)
scripts/           build/deploy helpers
tests/             Playwright e2e
migrations/        D1 SQL migrations
```

Dependencies point one way: `apps → review → collab → forge → identity → db-models` (and
`apps → github → forge`), with `git-host`, `diff` and `capabilities` below all of them, and
`ai` beside `forge` (collab and review use it). Frontend and API are same-origin (the Vite dev
server proxies `/api` and `/<name>.git/`), so there is no CORS.

## The API contract

Contract-first [oRPC](https://orpc.dev): procedures are declared in `@lib/contract`
(`oc.route({ method, path }).input().output()`), implemented with `implement(contract)` and
served as plain REST by `OpenAPIHandler`, so every URL is the one the contract names. The
frontend calls them through `@orpc/tanstack-query` (`useQuery(orpc.me.queryOptions())`);
query keys follow the contract's nesting (`orpc.repositories.key()`), so never hand-write one.

Four implementers in `apps/backend/src/routes/api.ts`, each adding one gate:

- `publicApi` — signed-out visitors: capabilities and first-run setup. Maps domain errors
  (`ForgeError`, `GitHostError`, …) to HTTP answers with their message.
- `signedInApi` — resolves the request's `Principal` from an API key or the browser session,
  else `401`. Only `me` uses it directly.
- `api` — also refuses a user who must change their password (`403`,
  `data.reason: "password_change_required"`). Everything else.
- `adminApi` — also requires `role: "admin"`. Instance settings.

Handlers stay thin: they pass `context.principal` to a domain lib, which decides access.

## Identity

better-auth in `@lib/identity` (`getAuth()`), mounted on `/api/auth/*`, over the `user` /
`user_sessions` / `user_accounts` / `user_verifications` / `api_keys` tables, with three
plugins:

- **username** — sign in with a username or an email. Usernames follow `NAME_RULE`.
- **admin** — `role` and the ban flag (shown as Deactivated). Admin pages call its endpoints
  directly; hooks in `auth.ts` force a username on created users, email an invite to one
  created without a password and flag it `invited` ([emails.md](emails.md#invites-and-password-reset)),
  set `mustChangePassword` until the user chooses their own password, and refuse to demote or
  deactivate the last admin. Sign-up is always off.
- **API keys** — `metadata.kind` is `user` (prefix `cgit_pat_`) or `agent` with
  `metadata.agentId` (`cgit_agt_`). Keys are created only server-side by `createKey`; the
  client `/api-key/*` endpoints are blocked, since a client could set any metadata.

An agent (`agents` table) belongs to a user and acts for them: its level on a repository is
the lower of its grant and its owner's level (`effectiveLevel` in `@lib/forge`). The first
admin is created at `/setup` with the `SETUP_TOKEN` secret, only while no admin exists.

The base URL is dynamic: a request on the canonical host or one allowed by
`scripts/lib/environments.mjs` (`AUTH_ALLOWED_HOSTS`) wins, and an unknown host falls back to
`FRONTEND_CANONICAL_BASE_URL`, so one Worker version can serve its workers.dev URL and any
custom domains.

## Git hosting

Every repository is a Cloudflare Artifacts repo named after its id, reached through the
`ARTIFACTS` binding (`@lib/git-host`). People use git through the Worker at
`/<name>.git` with an API key as the Basic password: `serveGit` in `@lib/forge` checks Read
or Write, mints a 15-minute Artifacts token and streams the request on.

The Code tab browses any branch or commit (`?ref=`, the default branch when left out). The SPA
resolves the ref to a commit with `GET /api/repositories/:name/commits?limit=1` and reads every
path at that commit, so each read caches for good. `GET …/contents` (`readRepositoryPath` in
`@lib/forge`) answers a path with a directory's entries or a file, reading one tree per path
segment; a raster image comes back base64-encoded and is shown from a `data:` URL, so no file is
ever served raw from the app's origin. `GET …/branches` reads git's own ref advertisement
(`info/refs`), since the Artifacts binding cannot list refs, `GET …/commits` pages a ref's
first-parent history, `GET …/commits/:hash` lists the files a commit changes against its first
parent (`readCommit`) and `GET …/commits/:hash/file` reads one of them before and after, and `GET …/files` lists every path at a ref for finding a file, reading
at most 2000 trees and saying when it stopped short. A pull request's changed file comes back
the same way (`readShownFiles`), so a changed image shows as its two versions.

## Agent sessions and pull requests

`POST /api/sessions` (agent keys only) forks the repository's default branch into a session
repository and returns its remote, an 8-hour write token for it alone, and the session prompt
(`@lib/collab`). The agent pushes a branch there and calls
`POST /api/sessions/:id/pull-requests`; `@lib/review` diffs the branch against its merge base
with the forked default branch, stores the changed files, and returns the pull request in
`processing` with the processing prompt (an instance setting with a built-in default). The agent
sends the groups to `PUT /api/pull-requests/:id/groups`, which validates every range and opens
the pull request. The UI calls groups _brackets_; the API, the prompts and the
`pull_request_groups` table keep the original name. A range may carry `movedFrom`, the lines in the old version of a changed file
it came from, so the review can compare a move with its original, and `reference`, the lines of
existing code (any file, on the target branch at the base commit) it was copied from or modelled
on. The review puts the reference beside the range, greyed, and highlights only what differs;
`GET …/pull-requests/:number/reference` reads it.

A reviewer accepts changes one at a time, by block, chunk, file or group. A change is keyed by
its text and the line above it (`@lib/diff`), and each person's accepted keys are rows in
`review_marks`. The first `GET …/review` of a revision diffs every file in the worker and
stores its changes on `pull_request_files`, so progress shows in the pull request list without
opening any diff; marks on changes the revision no longer has are dropped then. Agents read the
review but cannot accept.

### Transcripts, comments and reviews

A pull request keeps the commits its branch adds over the session's base (`pull_request_commits`,
first-parent, at most 250), re-read on every refresh. A transcript (`transcripts`) belongs to a
session and reaches a commit one of two ways: the agent uploads it naming the commit
(`POST /api/sessions/:id/transcripts` with `commit`), or the commit's `Agent-Transcript:` trailer
names it — an id the agent uploaded without a commit, or the path of a transcript file in the
commit, which is read, stored and left out of the reviewed files. Entries are a person's prompt
or what the agent said, with the tools it ran. Claude sends an outline of the conversation and
its steps, rephrased in order, rather than a raw transcript.

Comments (`pull_request_comments`) sit on a line range, counted like group ranges, with one
level of replies. A person's comment, flag or accept is a draft, seen only by them, until their
review (`POST …/reviews`, a verdict and a note, `pull_request_reviews`) sends it, or they send it
now; an ask, a reply and everything an agent writes go out at once. Agents only comment, to
explain an unorthodox decision or hard code, and reply. A flag stays open until the person who
set it resolves it. The review UI pins a range's comments to one card (`useLineNotes`), and the
Activity tab lays the commits, their transcripts, the reviews and the comments sent to the agent
on one timeline.

### Chat

People chat with their own agents listening on a pull request, from a bar at the bottom of
every tab that opens into a movable panel (`screens/pull-requests/chat/`); nobody sees or
writes to someone else's agent. A channel (`chat_channels`, `@lib/review/chat`) is one agent
listening on one pull request: creating a pull request opens one for its agent, tied to the
session (it closes when the session ends), and any agent that can read the repository opens or
re-keys its own with `POST /api/pull-requests/:id/chat`. Each agent has its own thread
(`chat_messages`). A message carries what the person was looking at (the tab, the file, lines
or group, and any text selected on the page, which the thread never shows), and a comment's
Ask on lines goes to the chat instead of onto the lines. A message the agent has not had yet
can be deleted; the agent marks one it is answering with `POST …/working` (or a `working`
socket frame), which shows as thinking dots until it answers or for five minutes.

An agent listens at `/api/chat/<key>/…`, where the key is the URL's only credential: it is
random, stored as a SHA-256 hash, replaced on re-listen, and refused (410) once the pull request
is merged or closed, the session ended or the agent was deactivated. It polls
`GET …/messages` every 25 seconds, which answers at once, or holds `…/socket` open, and replies
with `POST …/messages` (or up the socket). A message is marked delivered when a poll or socket
hands it over. Each channel has a `ChatChannelObject` Durable Object (binding `CHAT_CHANNELS`)
that holds only the open sockets, with the hibernation API so it is billed only while handling
a message, and keeps a socket's agent seen with an alarm; D1 stays the record. An agent is
live while it polled, replied or held a socket in the last minute. The session prompt offers
every agent both, the socket and polling, and lets it choose.

### Agent prompts

The session prompt (`@lib/collab`) and the processing prompt (`@lib/review`) are instance
settings with built-in defaults, edited under Admin > Agent config. The processing prompt is
one setting for both ways of processing; while no admin has written one it is the built-in
default of the way pull requests are processed (the agent's, or the server's), and a written
one is kept when that changes, with a warning on the page. Both are templates (`renderTemplate`): `{{name}}`
placeholders, and `{{#if claude}}…{{else}}…{{/if}}` blocks for the conditions in
`PROMPT_CONDITIONS`. A session is Claude's when the agent names itself so in `client` when it
starts the session, or its request's user agent says so (`agent_sessions.client`).

### Rules

A repository's rules (`repository_rules`, `@lib/review/rules`) are copied onto a pull request
(`pull_request_rules`) whenever a revision is stored, so editing a rule never changes an open
review. Pattern rules (file globs or regexes, or JS/TS import and comment lines) are evaluated
in the same lazy diff pass and stored as change keys on `pull_request_files.matches`. The
processing prompt describes every rule, so the agent keeps auto-accepted lines out of its groups,
and asks it to judge the prompt rules; the agent answers with line ranges in the groups
request, turned into keys when the review is read. An auto-accept rule counts its changes as
accepted for everyone; a `review_marks` row with `accepted = 0` is one person turning that off
for a change. High-impact and require-review rules only change what the review shows and
waits on.

### Server-side processing

Grouping can run on the server instead of in the agent (Admin > Agent config, stored as
`agent.config` in `instance_settings`). It needs three optional bindings, so
`capabilities.ai` is true only with all of them: `AI` (Workers AI, always through an AI
Gateway: the admin's, else `default`, which AI Gateway creates on first use),
`PROCESSING` (a Durable Object) and `LOADER` (the Worker Loader). `groupsOnServer()` in
`@lib/ai` is true when the admin chose the server and the bindings are there; losing one
falls back to agents. _Test model_ asks the model in the form (saved or not) for a one-line
answer and keeps the result as `agent.modelTest`, shown on the page; the model field
completes from the binding's own catalogue (`searchModels`, text-generation models whose
names hold every typed word) and Anthropic's Claude models, which AI Gateway routes to
Anthropic through the same binding (`anthropic/…`). Claude takes the Anthropic Messages shape
(`wire.ts`: the system prompt apart, no JSON mode) and is billed through AI Gateway's Unified
Billing credits or a key stored on the gateway.

Each revision records who groups it (`pull_requests.grouped_by`). For `server`, creating or
refreshing the pull request queues a job, the response carries no processing prompt, the
session instructions say so, and `PUT …/groups` refuses the agent. The job goes to the pull
request's `PullRequestProcessor` Durable Object (`apps/backend/src/processing.ts`), which keeps
the latest revision waiting (a newer one replaces it), and any ad hoc questions (below), and
runs them from an alarm, so each has fifteen minutes and it works the same in previews, which
cannot consume a Queue. The model's part runs in
a Dynamic Worker: the files of `libs/review/src/processing/sandbox/` are compiled into
`virtual:processing-sandbox` at build time and loaded with no network and no bindings. Its
only capabilities are two stubs made from `ctx.exports` with the job as props, so they reach
that one revision only. `GroupingToolsEntrypoint` gives `prompt()` (the server prompt, with
the numbered diff and the transcripts on its commits: their latest words up to the admin's
_Transcript limit_, 20,000 by default), `complete()` and `check()`. `SessionRepositoryEntrypoint` is its access
to Artifacts, which a Dynamic Worker cannot be bound to directly: `list()` and `read()` of
the session repository, read-only, at the pull request's base and head commits. The model
may answer with reads before its groups (up to eight turns), which is how it finds the
existing code a range names as its `reference`. It is shown the problems `check()` finds
and asked again, up to three answers. The host validates the answer again
before storing it. An answer still wrong opens the pull request without groups and records
why in `processing_error`; a thrown error is retried twice first, with backoff.

**Ad hoc questions.** While the server processes pull requests, the chat offers _Ad hoc_
beside a person's agents (the only choice when none of theirs listens), to anyone who can read
the pull request. Its messages live on the pull request's ad hoc channel, a `chat_channels` row
with no agent and no key, one thread per person. A question is stored, then queued as an
`answer-chat` job on the same Durable Object, which marks it delivered and being worked on and
runs `answerQuestion` in the sandbox with `AnswerToolsEntrypoint` and
`AnswerRepositoryEntrypoint`, both scoped to that question. The prompt
(`processing/answer-prompt.ts`) carries the change, its groups, its transcripts (as for
grouping; "(none)" without), the diff, the person's whole thread so far (the oldest dropped
only past a size budget) and what they were looking at; the model may
read files first, as when grouping, and answers in markdown with `lines` blocks. The answer,
or why there is none, is posted as the reply.

## GitHub

An instance is deployed per team, so there is no GitHub App or OAuth app: people add GitHub
**personal access tokens** (classic or fine-grained) under Account › GitHub tokens
(`github_tokens`). Each is checked against `GET /user` when added and stored AES-GCM encrypted
with a key derived (HKDF) from `BETTER_AUTH_SECRET`, so rotating that secret means adding the
tokens again. Tokens belong to people; agents never hold one. The add-token dialog lists the
permissions each feature needs (`FINE_GRAINED` and `CLASSIC` in `GithubTokensScreen.tsx`).

A repository is **connected** to one GitHub repository (`github_connections`, Settings ›
GitHub), or imported from one (`POST /api/repositories/import`, instance admins). Both pick a
token first and then one of the repositories it reaches (`GET /user/repos`). Connecting needs
git hosting, as any repository does, and is refused without it. The connection reads GitHub
with the token of the person who connected it; deleting that token stops syncing until a
repository admin connects it again with their own.

- **Branches** are mirrored by the Worker itself (`mirrorBranches` in `@lib/git-host`): it
  reads both sides' ref advertisements, asks GitHub's `git-upload-pack` for the missing objects
  (the storage's tips as `have`s) and streams the pack straight into the repository's Artifacts
  `git-receive-pack` with the ref updates, so neither a clone nor a private repository needs
  Artifacts' own import. GitHub wins: a diverged branch is overwritten. A full sync creates and
  moves branches but deletes none; a push webhook syncs its one branch, deleting it when GitHub
  no longer has it.
- **Webhooks**: each connection has an instance-generated secret and its own URL,
  `POST /api/github/webhooks/:connectionId`, which verifies `X-Hub-Signature-256` over the raw
  body. Connecting never creates the hook (`push`, `pull_request`, `workflow_run`). Settings
  offers a button to create it, and to remove it again, when the token looks able to:
  its account is an admin of the GitHub repository and the token has the `repo` or
  `admin:repo_hook` scope (classic), or can read the hooks (fine-grained, whose permissions
  GitHub does not reveal). Otherwise the page says what is missing and shows the URL and
  secret to add by hand. A push is only a hint to sync (run after the answer with
  `waitUntil`), so a replayed delivery changes nothing.
- **Workflow runs** are stored from `workflow_run` deliveries and refreshed on every full sync
  (`github_workflow_runs`; a late delivery never rolls a run back). Jobs and artifacts are read
  live from GitHub, and logs and artifact zips are handed out as GitHub's short-lived download
  links. Anyone who can read the repository, agents included, can read all of it.

### Pull requests and merging

A pull request stands for the **GitHub pull request on the same branch** into the same target
(from the repository itself, not a fork). It is linked when a `pull_request` delivery names
one, or when its GitHub panel finds one open; nothing is opened on GitHub by itself. Then
GitHub drives its state: closed there closes it, reopened reopens it, merged marks it merged,
and a branch deleted on GitHub closes the linked pull requests and deletes the branch from
their session repositories. Each new revision of a linked pull request is pushed to its
GitHub branch. The overview reads the workflow runs on the GitHub head live (storing them, so
no webhook is needed) and GitHub's check runs and commit statuses on it. A fine-grained token
cannot be granted check runs, so for one each workflow run stands in for its checks.

Merging offers GitHub's three methods (`merge`, `squash`, `rebase`), to people with Write:

- **Connected to GitHub**: it merges there. Without a GitHub pull request the button is
  _Create in GitHub_, which pushes the reviewed head of the session branch to a branch of the
  same name (refused if GitHub has that branch at another commit) and opens one. The merge
  passes the reviewed head as `sha`, so GitHub refuses commits nobody reviewed, and the
  target branch then syncs back.
- **Not connected**: it merges in Artifacts (`landBranch` in `@lib/git-host`). The reviewed
  head is copied from the session repository as `refs/pull/<n>/head`, then the Worker writes
  the merge or squash commit itself (a pack of one commit) and moves the target with a
  compare-and-swap push; rebase is a fast-forward. With no content merge this needs the
  target not to have moved past where the branch left it; otherwise the agent merges the
  target in and refreshes first.

Either way, a session branch with commits the review has not seen is refused.

### Pull requests from GitHub

While the server groups pull requests (see Server-side processing), a person with Write on a
connected repository can open one from an open GitHub pull request from the repository's own
branches, which it then stands for, or from any branch and target (`openFromGithub` in
`@lib/github`). Both branches are synced first. Such a pull request has `origin = 'github'`, no
session and no agent; its author is that person. Its commits live in the repository's own
Artifacts repository, where branches are mirrored, so reading one goes through `storageName`
in `@lib/review` (the session's repository, or the repository's for `github`). It is compared
from the target's tip, and the server groups every revision. A sync that moves its branch
(a push delivery, or a full sync) stores a new revision; while the server does not group, that
revision opens without groups and says why. Nothing is pushed back to GitHub for it, and a
branch deleted on GitHub closes it.

### Workflow rules

A `run-workflow` rule names a workflow of the connected repository (picked from
`GET …/github/workflows`) and starts it with `workflow_dispatch` on the pull request's branch
when a revision matches, once it is grouped (so prompt rules are judged) and the
pull request is on GitHub; until then it waits, and each revision starts it again. Copying
rules keeps a workflow rule only if the target repository has a workflow at the same path,
and names the dropped ones.
