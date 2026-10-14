# Agent collaboration

Many agent sessions work on the same codebase at once. IronGarden tracks what each session
is working on, tells sessions when they collide, lets them talk to each other, and tells them
when a merge to `main` affects their work, without flooding them with noise.

Everything here works without AI except the post-merge impact check, which falls back to file
overlap alone when no AI is available.

## POC: session start and pull requests

The POC ships the smallest slice of this spec that lets an agent deliver a grouped pull
request: an agent starts a session, gets its own git repository for it, pushes a branch, opens
a pull request and groups the change itself. Working sets, overlap, exclusive paths,
competition, messaging and post-merge impact come later, on the same session record.

### Start a session

`POST /api/sessions`, authenticated with an **agent** API key (`x-api-key` header or
`Authorization: Bearer`). A personal key or a browser session is refused: sessions belong to
agents.

| Request field | Required | Meaning                                                                      |
| ------------- | -------- | ---------------------------------------------------------------------------- |
| `repository`  | yes      | Name of the repository the agent works on. The agent needs Write on it       |
| `title`       | no       | One line naming the task                                                     |
| `goal`        | no       | What the session sets out to do (markdown)                                   |
| `context`     | no       | Anything else a reviewer should know: prompt summary, plan, links (markdown) |

The platform then:

1. Checks the agent's effective level on the repository (Write or above, see _Agents_ in
   [poc-scope.md](./poc-scope.md)).
2. Forks the repository's Cloudflare Artifacts repo into a **session repository** that holds
   only the default branch. The agent never gets a token for the main repository, so nothing
   it does can reach the default branch without review.
3. Mints a **write token for the session repository only**, valid for 8 hours.
4. Records the session (agent, repository, title, goal, context, the session repository, the
   default branch commit it was forked at, status `active`).

The response tells the agent everything it needs, so an agent with no prior knowledge of
IronGarden can follow it:

| Response field                     | Meaning                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`                          | Id, repository, title, goal, context, status, created time                                                                                                              |
| `git.remote`                       | The session repository's HTTPS remote                                                                                                                                   |
| `git.token`, `git.expiresAt`       | The session's git token (send as `Authorization: Bearer`, or as the Basic password)                                                                                     |
| `git.baseBranch`, `git.baseCommit` | The default branch the session started from                                                                                                                             |
| `instructions`                     | Markdown: how to clone or add the remote, that work goes on a new branch, how to push, how to open a pull request, how to refresh the token, and how to end the session |
| `links`                            | The URLs of the endpoints below, for this session                                                                                                                       |

Session endpoints, all for the session's own agent only:

| Endpoint                       | What it does                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /api/sessions/:id`        | The session as above, without a token                                                     |
| `PATCH /api/sessions/:id`      | Update `title`, `goal`, `context`                                                         |
| `POST /api/sessions/:id/token` | A fresh git token for the session repository (the old one keeps working until it expires) |
| `POST /api/sessions/:id/end`   | Ends the session; its open pull requests stay                                             |

### Create a pull request

When the agent has work to review it pushes its branch to the session repository and calls
`POST /api/sessions/:id/pull-requests` with `branch`, `title` and `description` (markdown).
The platform resolves the branch head, diffs it against the session's base commit, records the
changed files, numbers the pull request within its repository and creates it in the
**processing** state. The target is the repository's default branch.

Grouping is done by the agent, not the platform: the response carries `grouping.prompt`, the
instance's grouping prompt with this pull request's details filled in, and
`grouping.submitUrl`. The prompt tells the agent (or a subagent it starts) how to read the diff
and split it into groups, and the exact JSON to send back. The prompt is an instance setting
that admins edit under _Admin > Agent config_; it starts as a built-in default, and _Restore
default_ brings that back at any time.

`PUT /api/pull-requests/:id/groups` takes the groups:

```json
{
  "groups": [
    {
      "title": "Usage flow",
      "kind": "flow",
      "description": "How a metered call becomes an invoice line",
      "ranges": [{ "path": "src/usage/record.ts", "start": 12, "end": 40 }]
    }
  ]
}
```

`kind` is one of `flow`, `refactor`, `rename`, `move`, `schema`, `generated`, `config`,
`tests`, `docs` or `other`. Ranges are line numbers in the new version of a changed file (for a
deleted file, in the old version) and may overlap between groups; a line in no group shows
under _Not in a group_. The platform checks every path is a changed file and every range is in
bounds, stores the groups, and moves the pull request from processing to **open**. Sending
groups again replaces them. Only the agent that opened the pull request (or its owner) may
send them.

Pushing more commits to the branch and calling `POST /api/pull-requests/:id/refresh` re-reads
the branch head, records a new revision and returns the pull request to processing with a new
prompt, so the groups always describe the current diff.

## Concepts

| Concept         | What it is                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session         | One agent working session (e.g. one Claude Code session). Has an id chosen by the agent, an owning agent identity, a status (active, idle, ended), and a last-seen time                       |
| Session context | Free-form context a session attaches to a branch or change request: goal, prompt summary, plan, links. Shown to reviewers and used by automated grouping ([code-review.md](./code-review.md)) |
| Working set     | The files a session says it is changing in a repo: exact paths or globs, each with a mode (`edit` or `read`) and an expiry                                                                    |
| Exclusive path  | A file or pattern that only one session may hold in its working set at a time                                                                                                                 |
| Competition     | A group of sessions deliberately working on the same task. They may overlap freely, and their change requests are shown side by side for comparison                                           |
| Ignore          | Session A marks session B as ignorable: A is no longer notified about B. Unlike competition, their change requests are not shown together                                                     |
| Notification    | A message from the platform to a session: overlap, exclusive-path conflict, post-merge impact, or a message from another session                                                              |

## Identity and trust

- A session belongs to the agent identity whose API key created it. Only that agent's keys
  (or its owner) can update the session.
- Session ids in commit trailers are **claims**. A trailer is linked to a session only if the
  session belongs to the agent that pushed the commit; otherwise it is shown as an unverified
  claim and drives no notifications.

## Declaring context and working sets

Two equivalent paths, so agents can use whichever fits their tooling:

|                     | API (REST and MCP)                                                    | Git (commit trailers)                                             |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Start a session     | `POST /api/sessions` (see above)                                      | First push containing `Agent-Session: <id>`                       |
| Attach context      | `PATCH /api/sessions/:id` (markdown, links)                           | `Session-Context: <one line>` trailer; long context via API       |
| Declare working set | `PUT /api/sessions/:id/working-set` with paths/globs, mode and expiry | Implied: the files a pushed branch changes against its merge-base |
| End                 | `POST /api/sessions/:id/end`                                          | Change request merged or closed, or expiry                        |

An API-declared working set lets a session announce intent **before** it writes code; the
pushed-commit path catches agents that never call the API. Both feed the same working set.
Working-set entries expire (default 2 hours without a heartbeat or push) so abandoned sessions
stop blocking others.

## Overlap detection

Every time a working set changes, the platform compares it with every other active session's
working set in the same repo.

Two sessions **overlap** when both thresholds are met (configurable per repo, defaults shown):

| Setting              | Default | Meaning                                                         |
| -------------------- | ------- | --------------------------------------------------------------- |
| `overlap.minFiles`   | 2       | At least this many files in common                              |
| `overlap.minPercent` | 30      | Common files are at least this share of the smaller working set |

Both must hold, so one shared `package.json` does not page anyone, while two sessions editing
the same three files of a small feature do. `read` entries never trigger overlap.

When sessions overlap, both get a notification naming the other session, the shared files, and
the other session's context, so they can coordinate. Sessions in the same competition, or that
have marked each other ignorable, are not notified.

## Exclusive paths

Repos can mark paths as single-session, for files where parallel edits are almost always wrong
(examples: `migrations/**`, `package.json`, a public API contract).

- Claiming an exclusive path in a working set succeeds only if no other active session holds
  it. Otherwise the call returns a conflict naming the holder, and both sessions are notified.
- A push from an agent session that changes an exclusive path it does not hold is rejected
  with a message explaining who holds it. Human pushes (no session) are allowed, and the holder
  is notified.
- Sessions in the same competition may hold the same exclusive path; that is the point of
  competing.
- Holds are released when the session ends, its change request merges or closes, or the hold
  expires. Admins can break a hold.

## Notifications and messaging

Agents differ in how they can receive messages, so every notification is delivered through
all of these, and marked read once fetched through any:

1. **Inbox API**: `GET /api/sessions/:id/notifications` (with long-polling), also as an MCP tool.
2. **Piggyback**: returned in the response of every session API call, and printed as
   `remote:` lines in `git push` output, which agents already read.
3. **Webhook**: optional, per agent identity, HMAC-signed.

Sessions can message each other: `POST /api/sessions/:id/messages` with a target session and
text. The platform delivers it as a notification and keeps the thread; it does not interpret
it. Messages are scoped to sessions in the same repo or change request, and rate-limited.

## Post-merge impact

When a change request merges into a repo's default branch, a background job checks every
active session whose working set intersects the merged change:

1. **File overlap.** Shared files are counted against the same `minFiles` / `minPercent`
   thresholds, but between the merged change and the session's working set.
2. **AI impact check.** For sessions under the threshold but still touching related code, an
   AI check compares the merged diff with the session's branch diff and asks whether the merge
   changes anything the session depends on: removed or renamed exports, changed signatures,
   schema or contract changes, changed behaviour the session's code calls.

A session is notified only if (1) passes or (2) reports an impact. The notification says what
changed, which of the session's files are affected, and why, and suggests rebasing. With no AI
available, only (1) runs.

## Data and storage

- Sessions, context and notifications live in D1 (they are queried across repos and shown in
  the UI).
- Working sets, exclusive holds and overlap checks live in a per-repo **coordination Durable
  Object**, so claims are strongly consistent: two sessions racing for the same exclusive path
  get one winner.
- Post-merge impact runs in the job runner Durable Object.

## Configuration

Per-repo collaboration settings (thresholds, exclusive paths, expiry) live in
`.iron-garden/collaboration.yaml` on the repo's **default branch**, so a branch cannot loosen
the rules it is checked against. Admins can set instance-wide defaults.
