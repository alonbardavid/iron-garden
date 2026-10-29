---
title: Reviews
description: Read and set which changes you accepted, comment, flag and ask on lines, and send your review, with a personal key.
---

Only people review. Accepting changes and sending a review refuse an agent key with `403`, and an agent's comments on lines are plain comments. Every endpoint here takes Read on the repository.

## GET /api/repositories/{name}/pull-requests/{number}/review

Every change in the pull request, file by file, and which ones you accepted.

| Field              | Type     | Description                                                                                                                                                                                                   |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `revision`         | number   | The revision the changes belong to                                                                                                                                                                            |
| `files[].path`     | string   |                                                                                                                                                                                                               |
| `files[].changes`  | array    | `{ key, at }`: the change's key, and the line it sits at                                                                                                                                                      |
| `files[].accepted` | string[] | The keys you accepted, including `auto`                                                                                                                                                                       |
| `files[].auto`     | string[] | The keys an auto-accept rule accepted for you                                                                                                                                                                 |
| `rules`            | array    | Each rule as it ran on this revision: `{ id, ruleId, name, match, action, reviewers, workflow, dispatch, files }`. For require-review, `reviewers[].done` says whether each reviewer accepted all its changes |

For an agent key, `accepted` and `auto` are always empty.

```sh
curl -sS https://<instance>/api/repositories/billing/pull-requests/12/review \
  -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

## PUT /api/repositories/{name}/pull-requests/{number}/review

Accepts changes, or undoes accepting them. Undoing a change a rule accepted turns the rule off for it, for you.

| Field            | Type     | Required | Description                             |
| ---------------- | -------- | -------- | --------------------------------------- |
| `accepted`       | boolean  | Yes      | `true` to accept, `false` to undo       |
| `changes`        | array    | Yes      | 1 to 1,000 files, each `{ path, keys }` |
| `changes[].path` | string   | Yes      | The file                                |
| `changes[].keys` | string[] | Yes      | Change keys from `GET …/review`         |

One request holds at most 20,000 keys; send a larger selection in parts. The response is the review, as `GET` returns it.

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| `400`  | A key is not in the current revision: read the review again |
| `403`  | An agent key                                                |

```sh
curl -sS -X PUT https://<instance>/api/repositories/billing/pull-requests/12/review \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "accepted": true, "changes": [{ "path": "src/usage/record.ts", "keys": ["<key>", "<key>"] }] }'
```

## POST /api/repositories/{name}/pull-requests/{number}/reviews

Sends your review: a verdict, with every draft you wrote on the pull request and how far through it you are.

| Field     | Type           | Required | Description                       |
| --------- | -------------- | -------- | --------------------------------- |
| `verdict` | string         | Yes      | `accept` or `changes`             |
| `body`    | string \| null | No       | Markdown, up to 20,000 characters |

The response:

| Field       | Type                   | Description                       |
| ----------- | ---------------------- | --------------------------------- |
| `id`        | string                 | Starts with `REV_`                |
| `author`    | `{ id, name }` \| null |                                   |
| `verdict`   | string                 |                                   |
| `body`      | string \| null         |                                   |
| `revision`  | number                 | The revision you reviewed         |
| `accepted`  | number                 | How many changes you had accepted |
| `total`     | number                 | How many changes it has           |
| `createdAt` | number                 |                                   |

It answers `403` to an agent key.

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/pull-requests/12/reviews \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "verdict": "changes", "body": "One flag on the warning." }
EOF
```

## GET /api/repositories/{name}/pull-requests/{number}/comments

Every comment that went out, and your own drafts. The fields are on the [agent page](/api/agent/pull-requests/#get-apirepositoriesnamepull-requestsnumbercomments).

## POST /api/repositories/{name}/pull-requests/{number}/comments

A comment on lines, or a reply. A person's `comment`, `flag` or `accept` is a draft, seen only by you, until your review goes out or you send it; `send: true` sends it at once. An `ask` and a reply go out at once.

| Field    | Type    | Required               | Description                                                                   |
| -------- | ------- | ---------------------- | ----------------------------------------------------------------------------- |
| `parent` | string  | For a reply            | The comment that starts the thread; it must have gone out                     |
| `kind`   | string  | For a comment on lines | `comment`, `flag` (must change), `accept` or `ask` (a question for the agent) |
| `path`   | string  | For a comment on lines | A file the pull request changes                                               |
| `start`  | number  | For a comment on lines | First line, 1-based, in the new version of the file                           |
| `end`    | number  | For a comment on lines | Last line, inclusive                                                          |
| `body`   | string  | Yes                    | Markdown, up to 20,000 characters                                             |
| `send`   | boolean | No                     | Send a draft kind at once                                                     |

The response is the comment.

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/pull-requests/12/comments \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "kind": "flag", "path": "src/usage/record.ts", "start": 20, "end": 24, "body": "Free-tier calls must still be recorded." }
EOF
```

## POST /api/repositories/{name}/pull-requests/{number}/comments/{comment}/send

Sends one of your drafts ahead of your review. It takes no body; the response is the comment, `status` `sent`.

## PUT /api/repositories/{name}/pull-requests/{number}/comments/{comment}/resolution

Resolves one of your flags, or reopens it. A flag holds the pull request until the person who set it resolves it.

| Field      | Type    | Required | Description                          |
| ---------- | ------- | -------- | ------------------------------------ |
| `resolved` | boolean | Yes      | `true` to resolve, `false` to reopen |

The response is the comment, with `resolved` set at the current head commit. It answers `400` for anything but a flag that went out, and `403` for someone else's.

## DELETE /api/repositories/{name}/pull-requests/{number}/comments/{comment}

Deletes a comment of yours. It answers `{ "ok": true }`, and `403` for someone else's.
