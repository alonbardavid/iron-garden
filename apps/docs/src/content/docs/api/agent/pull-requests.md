---
title: Pull requests
description: Open a pull request from a session, send its brackets, refresh it after more pushes, and read and answer reviewers.
---

An agent opens a pull request from a branch it pushed to its session remote. The pull request is **processing** until its changes are split into brackets (called groups in the API), and **open** for review once they are. People accept changes and merge; agents never do.

## POST /api/sessions/{id}/pull-requests

Opens a pull request for a branch of the session repository, into the session's base branch. Only the session's agent key may call it; the session must be active and the agent needs Write.

| Field         | Type           | Required | Description                                                |
| ------------- | -------------- | -------- | ---------------------------------------------------------- |
| `branch`      | string         | Yes      | The branch in the session repository; up to 200 characters |
| `title`       | string         | Yes      | One line, up to 200 characters                             |
| `description` | string \| null | No       | Markdown, up to 50,000 characters                          |

The server compares the branch with its merge base on the base branch. A branch cut from an older commit, or one that merged the base in, shows only its own work. It stores the changed files and up to 250 first-parent commits, attaches the transcripts their `Agent-Transcript` trailers name, copies the repository's rules onto the pull request, and records the branch's files in the session's working set.

| Field         | Type           | Description                                                                                                                       |
| ------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pullRequest` | object         | The [pull request](#the-pull-request-object), `status` `processing`                                                               |
| `grouping`    | object \| null | `prompt`, the processing prompt to follow, and `submitUrl`, where to send the groups. `null` when the server groups pull requests |
| `links`       | object         | See [Pull request links](#pull-request-links)                                                                                     |
| `chat`        | object         | Where the agent listens for chat on it: `url`, `messagesUrl`, `socketUrl`. See [Chat](/api/agent/chat/)                           |

| Status | When                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | The branch is not in the session repository, shares no history with the base, has no changes, or touches more than 1,000 files; or the session ended |
| `403`  | Not an agent key, or the agent has less than Write                                                                                                   |
| `409`  | The session already has a processing or open pull request for the branch; the message names it, to refresh instead                                   |

```sh
git push session meter-usage
curl -sS -X POST "$PULL_REQUESTS_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "branch": "meter-usage", "title": "Meter API calls", "description": "Records each metered call so invoices can bill usage." }
EOF
```

```json
{
  "pullRequest": {
    "id": "PR_…",
    "number": 12,
    "repository": "billing",
    "title": "Meter API calls",
    "status": "processing",
    "branch": "meter-usage",
    "targetBranch": "main",
    "revision": 1,
    "groupedBy": "agent",
    "origin": "agent",
    "files": [
      {
        "path": "src/usage/record.ts",
        "change": "added",
        "oldLines": 0,
        "newLines": 40
      }
    ],
    "groups": [],
    "…": "…"
  },
  "grouping": {
    "prompt": "…",
    "submitUrl": "https://<instance>/api/pull-requests/PR_…/groups"
  },
  "links": {
    "url": "https://<instance>/billing/pulls/12",
    "submitUrl": "https://<instance>/api/pull-requests/PR_…/groups",
    "refreshUrl": "https://<instance>/api/pull-requests/PR_…/refresh",
    "commentsUrl": "https://<instance>/api/repositories/billing/pull-requests/12/comments",
    "chatUrl": "https://<instance>/api/pull-requests/PR_…/chat"
  },
  "chat": {
    "url": "https://<instance>/api/chat/<key>",
    "messagesUrl": "https://<instance>/api/chat/<key>/messages",
    "socketUrl": "wss://<instance>/api/chat/<key>/socket"
  }
}
```

### Pull request links

| Link          | Endpoint                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | The pull request's page                                                                                                                  |
| `submitUrl`   | [`PUT /api/pull-requests/{id}/groups`](#put-apipull-requestsidgroups)                                                                    |
| `refreshUrl`  | [`POST /api/pull-requests/{id}/refresh`](#post-apipull-requestsidrefresh)                                                                |
| `commentsUrl` | [`GET`](#get-apirepositoriesnamepull-requestsnumbercomments) and [`POST` comments](#post-apirepositoriesnamepull-requestsnumbercomments) |
| `chatUrl`     | [`POST /api/pull-requests/{id}/chat`](/api/agent/chat/#post-apipull-requestsidchat), for new chat URLs                                   |

### The pull request object

| Field             | Type                                           | Description                                                                                                   |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`              | string                                         | Starts with `PR_`; the id in `/api/pull-requests/{id}/…`                                                      |
| `number`          | number                                         | Its number in the repository; the `{number}` in `/api/repositories/{name}/pull-requests/{number}`             |
| `repository`      | string                                         |                                                                                                               |
| `title`           | string                                         |                                                                                                               |
| `description`     | string \| null                                 | Markdown                                                                                                      |
| `status`          | `processing` \| `open` \| `merged` \| `closed` |                                                                                                               |
| `branch`          | string                                         | The session branch                                                                                            |
| `targetBranch`    | string                                         |                                                                                                               |
| `revision`        | number                                         | 1, and one more on each refresh                                                                               |
| `groupedBy`       | `agent` \| `server`                            | Who groups this revision                                                                                      |
| `origin`          | `agent` \| `github`                            | Opened by an agent's session, or from GitHub                                                                  |
| `agent`           | `{ name, ownerName }` \| null                  |                                                                                                               |
| `openedBy`        | string \| null                                 | Who opened one from GitHub                                                                                    |
| `baseCommit`      | string                                         | The merge base the change is read against                                                                     |
| `headCommit`      | string                                         | The branch's head this revision reviews                                                                       |
| `processingError` | string \| null                                 | Why the server could not group this revision; it opened without groups                                        |
| `files`           | `{ path, change, oldLines, newLines }[]`       | `change` is `added`, `modified` or `deleted`                                                                  |
| `fileCount`       | number                                         |                                                                                                               |
| `groups`          | `{ id, title, kind, description, ranges }[]`   | The brackets, as sent to [`PUT …/groups`](#put-apipull-requestsidgroups)                                      |
| `groupCount`      | number                                         |                                                                                                               |
| `review`          | `{ changes, accepted }`                        | The caller's progress; `changes` is null until someone opens the pull request. Always 0 accepted for an agent |
| `github`          | `{ number, url, state }` \| null               | The GitHub pull request it stands for, once there is one                                                      |
| `merge`           | `{ method, commit, by, at }` \| null           | How it was merged                                                                                             |
| `createdAt`       | number                                         |                                                                                                               |
| `updatedAt`       | number                                         |                                                                                                               |

## PUT /api/pull-requests/{id}/groups

Sends the brackets for the current revision. The request replaces any groups sent before, and a valid one opens the pull request for review. The session's agent may call it, with Write on the repository, while the pull request is processing or open.

| Field    | Type  | Required | Description                                                    |
| -------- | ----- | -------- | -------------------------------------------------------------- |
| `groups` | array | Yes      | Up to 100 [groups](#a-group)                                   |
| `rules`  | array | No       | Up to 100 [rule answers](#a-rule-answer), for the prompt rules |

### A group

| Field         | Type           | Required | Description                                                                                               |
| ------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `title`       | string         | Yes      | A few plain words, up to 200 characters                                                                   |
| `kind`        | string         | Yes      | `flow`, `refactor`, `rename`, `move`, `copy`, `schema`, `generated`, `config`, `tests`, `docs` or `other` |
| `description` | string \| null | No       | What the lines do and why, up to 5,000 characters                                                         |
| `ranges`      | array          | Yes      | 1 to 500 [ranges](#a-range), from any files                                                               |

### A range

| Field       | Type                   | Required | Description                                                                                                  |
| ----------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `path`      | string                 | Yes      | A file the pull request changes                                                                              |
| `start`     | number                 | Yes      | First line, 1-based, in the new version of the file (the old one for a deleted file)                         |
| `end`       | number                 | Yes      | Last line, inclusive                                                                                         |
| `note`      | string                 | No       | One sentence shown above the lines, up to 500 characters                                                     |
| `movedFrom` | `{ path, start, end }` | No       | Where moved lines came from: a changed file that existed before the change, in its old version               |
| `reference` | `{ path, start, end }` | No       | Existing code the lines were copied from or modelled on: a text file on the target branch at the base commit |

A line may sit in more than one group. Lines in none show to reviewers as not in a group.

### A rule answer

| Field    | Type                     | Required | Description                                                |
| -------- | ------------------------ | -------- | ---------------------------------------------------------- |
| `rule`   | string                   | Yes      | The id of a prompt rule, as the processing prompt names it |
| `ranges` | `{ path, start, end }[]` | Yes      | Up to 500 ranges: the changed lines the rule describes     |

The response is the [pull request](#the-pull-request-object), `status` `open`, with its `groups`.

| Status | When                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| `400`  | A range is wrong, listing every problem at once, one per line; or the pull request is merged or closed |
| `403`  | The server groups this revision, or the caller has less than Write                                     |
| `404`  | No such pull request, or not one of this agent's sessions                                              |

```text
groups[0].ranges[0]: lines 1-9 are outside hello.txt, which has 2 lines
groups[1].ranges[0].movedFrom: src/new.ts must be a changed file that existed before this change
```

Fix the problems and send the whole set again.

```sh
curl -sS -X PUT "$SUBMIT_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @groups.json
```

```json
{
  "groups": [
    {
      "title": "Usage flow",
      "kind": "flow",
      "description": "How a metered call becomes an invoice line.",
      "ranges": [
        {
          "path": "src/usage/record.ts",
          "start": 12,
          "end": 40,
          "note": "Each metered call is recorded with its team and units."
        },
        { "path": "src/billing/invoice.ts", "start": 8, "end": 25 }
      ]
    },
    {
      "title": "formatMoney moves to billing",
      "kind": "move",
      "ranges": [
        {
          "path": "src/billing/money.ts",
          "start": 1,
          "end": 30,
          "movedFrom": { "path": "src/utils/format.ts", "start": 4, "end": 33 }
        }
      ]
    },
    {
      "title": "A usage route copied from the credits route",
      "kind": "copy",
      "ranges": [
        {
          "path": "src/routes/usage.ts",
          "start": 1,
          "end": 29,
          "reference": {
            "path": "src/routes/credits.ts",
            "start": 1,
            "end": 28
          }
        }
      ]
    }
  ],
  "rules": [
    {
      "rule": "<rule id from the prompt>",
      "ranges": [{ "path": "src/billing/total.ts", "start": 3, "end": 9 }]
    }
  ]
}
```

See [Pull request processing](/agent-workflows/pull-request-processing/) for how the prompt asks agents to group.

## POST /api/pull-requests/{id}/refresh

Reads the branch again after more pushes. The pull request gets a new revision: its files, commits and rules are read again, its groups are dropped, and it is processing again. The session's agent may call it, with Write, while the session is active and the pull request is processing or open. It takes no body.

The response has the same shape as [opening one](#post-apisessionsidpull-requests), without `chat`: a new `grouping.prompt` unless the server groups it.

| Status | When                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `400`  | The pull request is merged or closed, the session ended, or the branch is refused as when opening one |

```sh
git push session meter-usage
curl -sS -X POST "$REFRESH_URL" -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

Refresh after every push. Merging refuses a branch with commits the review has not seen. On a repository not connected to GitHub, merging also needs the target branch not to have moved past where the branch left it; merge the target into the branch, push and refresh.

## GET /api/repositories/{name}/pull-requests/{number}

The [pull request](#the-pull-request-object), for anyone who can read the repository. A `processing` status turning `open` means the groups arrived.

```sh
curl -sS https://<instance>/api/repositories/billing/pull-requests/12 \
  -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

## GET /api/repositories/{name}/pull-requests/{number}/comments

Every comment that went out on the pull request, and the caller's own drafts, oldest first. The `links.commentsUrl`.

| Field        | Type                                             | Description                                                              |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `id`         | string                                           |                                                                          |
| `parent`     | string \| null                                   | The comment a reply answers                                              |
| `author`     | object \| null                                   | `{ kind: "user", id, name }` or `{ kind: "agent", id, name, ownerName }` |
| `mine`       | boolean                                          | Whether the caller wrote it                                              |
| `kind`       | `comment` \| `flag` \| `accept` \| `ask` \| null | Null on a reply. A `flag` marks something that must change               |
| `path`       | string \| null                                   | The file, on a comment on lines                                          |
| `start`      | number \| null                                   | First line, in the new version of the file                               |
| `end`        | number \| null                                   | Last line                                                                |
| `body`       | string                                           | Markdown                                                                 |
| `revision`   | number                                           | The revision it was written on                                           |
| `headCommit` | string                                           | The head commit it was written on                                        |
| `status`     | `draft` \| `sent`                                |                                                                          |
| `review`     | string \| null                                   | The review it went out with                                              |
| `resolved`   | `{ by, at, commit }` \| null                     | Set once the flag's author resolved it                                   |
| `sentAt`     | number \| null                                   |                                                                          |
| `createdAt`  | number                                           |                                                                          |

```sh
curl -sS "$COMMENTS_URL" -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

## POST /api/repositories/{name}/pull-requests/{number}/comments

A reply to a comment, or a comment on lines. Anything an agent writes goes out at once. An agent's comment on lines must be of kind `comment`; only people flag, accept or ask.

| Field    | Type   | Required               | Description                                         |
| -------- | ------ | ---------------------- | --------------------------------------------------- |
| `parent` | string | For a reply            | The comment that starts the thread                  |
| `kind`   | string | For a comment on lines | `comment` for an agent                              |
| `path`   | string | For a comment on lines | A file the pull request changes                     |
| `start`  | number | For a comment on lines | First line, 1-based, in the new version of the file |
| `end`    | number | For a comment on lines | Last line, inclusive                                |
| `body`   | string | Yes                    | Markdown, up to 20,000 characters                   |

The response is the [comment](#get-apirepositoriesnamepull-requestsnumbercomments).

| Status | When                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| `400`  | Neither `parent` nor all of `kind`, `path`, `start` and `end`; lines outside the file; or `parent` is itself a reply |
| `403`  | An agent sent a `kind` other than `comment`                                                                          |
| `404`  | No such parent comment                                                                                               |

```sh
curl -sS -X POST "$COMMENTS_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "parent": "CMT_…", "body": "Fixed in the second revision: `units` is now validated." }
EOF
```

A flag stays open until the person who set it resolves it. An agent deletes a comment of its own with `DELETE /api/repositories/{name}/pull-requests/{number}/comments/{comment}`, which answers `{ "ok": true }`.

## Reviews

An agent reads the reviews people sent with [`GET /api/repositories/{name}/pull-requests/{number}/activity`](/api/user/pull-requests/#get-apirepositoriesnamepull-requestsnumberactivity): each has a `verdict` (`accept` or `changes`) and a `body`. Accepting changes, submitting a review and merging are refused to agent keys with `403`; see [User API: Reviews](/api/user/reviews/).
