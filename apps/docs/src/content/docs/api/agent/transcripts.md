---
title: Transcripts
description: Upload a session's transcript as the agent works, the entry format, its limits, and how a transcript is tied to its commit.
---

A transcript records what an agent was asked and what it did, one transcript per commit. Everyone who can read the repository reads it beside the code.

:::caution
Keep API keys, git tokens and listener or chat URLs out of transcripts.
:::

## The entry format

A transcript is a list of entries, in order:

| Field    | Type                  | Required | Description                                                            |
| -------- | --------------------- | -------- | ---------------------------------------------------------------------- |
| `role`   | `"user"` \| `"agent"` | Yes      | `user` for a person's request, `agent` for what the agent said and did |
| `author` | string                | No       | Who made the request; up to 200 characters                             |
| `text`   | string                | Yes      | The request, or what the agent said; up to 50,000 characters           |
| `tools`  | array                 | No       | Up to 200 tools the agent ran, each `{ name, target }`                 |

| Tool field | Type   | Required | Description                                 |
| ---------- | ------ | -------- | ------------------------------------------- |
| `name`     | string | Yes      | Such as `Edit`; 1 to 40 characters          |
| `target`   | string | Yes      | Such as a file path; up to 1,000 characters |

```json
[
  {
    "role": "user",
    "author": "maya",
    "text": "Add a usage route modelled on the credits route."
  },
  {
    "role": "agent",
    "text": "Copied the credits route and changed it to take units and a SKU.",
    "tools": [{ "name": "Edit", "target": "src/routes/usage.ts" }]
  }
]
```

A transcript holds at most 2,000 entries and 1,500,000 bytes of JSON. A longer session splits by commit.

## POST /api/sessions/{id}/transcripts

Starts a transcript for the session, or appends to one. Only the session's agent key may call it, while the session is active.

| Field      | Type   | Required | Description                                                                                     |
| ---------- | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `entries`  | array  | Yes      | 1 to 2,000 [entries](#the-entry-format)                                                         |
| `appendTo` | string | No       | A transcript of this session no commit names yet; the entries go on its end                     |
| `commit`   | string | No       | The full, lowercase 40-character commit id the transcript led to; it then takes no more entries |

The response:

| Field       | Type                   | Description                                                |
| ----------- | ---------------------- | ---------------------------------------------------------- |
| `id`        | string                 | The transcript's id, starting with `TR_`                   |
| `commit`    | string \| null         | Null until a commit names it                               |
| `source`    | `"api"` \| `"trailer"` | `api` when an upload named the commit; `trailer` otherwise |
| `entries`   | number                 | How many entries it holds                                  |
| `createdAt` | number                 |                                                            |
| `updatedAt` | number \| null         | When entries were last appended; null if never             |

| Status | When                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| `400`  | Appending would pass 2,000 entries or 1,500,000 bytes, or the session ended  |
| `403`  | Not an agent key                                                             |
| `404`  | `appendTo` is no transcript of this session                                  |
| `409`  | `appendTo` already ended in a commit; upload the next one without `appendTo` |

Upload as the agent works: the first upload without `appendTo`, then each new request's entries with `appendTo`:

```sh
curl -sS -X POST "$TRANSCRIPTS_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "appendTo": "TR_…", "entries": [{ "role": "agent", "text": "Added the `units` check.", "tools": [{ "name": "Edit", "target": "src/usage/record.ts" }] }] }
EOF
```

```json
{
  "id": "TR_…",
  "commit": null,
  "source": "trailer",
  "entries": 14,
  "createdAt": 1760000000000,
  "updatedAt": 1760000300000
}
```

## Tying a transcript to its commit

| Way                     | How                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In the upload           | The last upload sends `commit`, with `appendTo` or alone                                                                                                                                                                          |
| A trailer naming the id | The commit message ends with `Agent-Transcript: <transcript id>`                                                                                                                                                                  |
| A trailer naming a file | `Agent-Transcript: <path>` names a transcript file in the commit: a JSON array of entries, an object with `entries`, or one JSON entry per line. It is stored as the commit's transcript and left out of the files reviewers read |

```text
Add a usage route

Agent-Transcript: TR_…
```

Trailers are read when the agent opens or refreshes the pull request that holds the commit. Once a commit names a transcript, the next upload starts a new one without `appendTo`.

Reviewers read the transcripts with [`GET /api/repositories/{name}/pull-requests/{number}/activity`](/api/user/pull-requests/#get-apirepositoriesnamepull-requestsnumberactivity) and the session's page. See [Transcripts](/agent-workflows/transcripts/).
