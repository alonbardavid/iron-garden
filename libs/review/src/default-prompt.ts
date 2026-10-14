import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";

// The grouping prompt an agent gets with its new pull request. Admins replace
// it under Admin > Agent config and can always restore this one. Placeholders
// in {{braces}} are filled per pull request; see PROMPT_PLACEHOLDERS.agent.
export const DEFAULT_GROUPING_PROMPT = `You are preparing pull request #{{number}} in {{repository}} for review on ${PRODUCT_DISPLAY_NAME}.

Reviewers on ${PRODUCT_DISPLAY_NAME} do not read a change file by file. They read it group by group and accept each group when they are satisfied with it. Your job is to split this change into groups that let a reviewer understand and accept it quickly and safely. You can do this yourself or hand this prompt to a subagent.

## The change

Title: {{title}}
Branch: {{branch}} (head {{headCommit}}), compared with {{baseCommit}}

Description:
{{description}}

Changed files (lines in the new version, or the old one for a deleted file):
{{changedFiles}}

Read the full diff with git in your session repository:

    git diff {{baseCommit}} {{headCommit}}

## How to group

- A group is a set of line ranges that a reviewer should judge together. Ranges can come from many files, and a line may belong to more than one group.
- Prefer groups that follow meaning, not files:
  - flow: one behaviour traced through every file it touches, in the order the code runs. Say what passes from one step to the next.
  - schema: database, API or contract changes, with the code that depends on them.
  - refactor, rename, move: mechanical changes that do not change behaviour. Say so explicitly, so the reviewer can skim them.
  - generated, config, tests, docs: what their names say.
  - other: only when nothing above fits.
- Put risky lines (security, data loss, migrations, money, concurrency) in a small group of their own, and say why they are risky.
- Mark moved code. When lines were moved from somewhere else in the old code (cut and pasted, maybe with small edits on the way), add "movedFrom" to their range with the path and lines they came from, counted in the old version of that file. Reviewers then read the moved lines against their original and only check what changed on the way. Put moved code in a group of kind "move" unless it belongs to a flow.
- Name references. When you wrote lines by copying existing code, or by closely following it as a model (a new route built from an existing route, a test copied from a neighbouring test, a second handler shaped like the first), add "reference" to their range with the path and lines of that existing code. Count those lines in the target branch's version of the file, as \`git show {{baseCommit}}:<path>\` prints it; the file need not be part of this change. Reviewers then read your lines beside the reference: what matches it is greyed out, and only what you changed, added or left out stands out, so they check the differences instead of rereading the copy. Give each copied piece its own range and point it at exactly the lines it came from. Don't name a reference for lines that only share a general style with existing code. Put copied code in a group of kind "copy" unless it belongs to a flow.
- Keep nearby changes together when they belong together. Changes a few lines apart in the same file that serve the same purpose go in the same group, as one range that spans them: a range may include unchanged lines, and reviewers read the code between as context. Two chunks close together in the same function that are part of the same step of the flow belong in one group, usually in one range. Don't merge changes that only happen to sit close but do different things.
- Every changed line should be in at least one group. Lines you leave out are shown as "Not in a group".
- Title each group in a few plain words. In the description, explain what the lines do and why, in two to four sentences a reviewer can check against the code.
- Give a range a "note" when it helps to know what its lines do on their own: one short sentence shown above them, such as the step of a flow they are. Skip it when the description already says it.
- Order the groups the way a reviewer should read them: the core change first, mechanical and generated changes last.

## Explain what needs explaining

If some lines make an unorthodox decision, or are hard code that their own comments do not explain, leave reviewers a comment on them: POST {{commentsUrl}} with { "kind": "comment", "path": "src/billing/total.ts", "start": 3, "end": 9, "body": "<why, in markdown>" }. Keep these rare. Most pull requests need none, and a comment that restates the code costs the reviewer time.

## What to send

Send one request: PUT {{submitUrl}} with your agent API key, and this JSON body. Send every JSON body from a file or a quoted heredoc (\`curl --data @body.json\`, or \`--data @- <<'EOF'\`), never inside a double-quoted shell string: the shell runs anything between backticks there as a command, so code names in your markdown vanish before the request is sent.

    {
      "groups": [
        {
          "title": "Usage flow",
          "kind": "flow",
          "description": "How a metered call becomes an invoice line.",
          "ranges": [
            { "path": "src/usage/record.ts", "start": 12, "end": 40, "note": "Each metered call is recorded with its team and units." },
            { "path": "src/billing/invoice.ts", "start": 8, "end": 25, "note": "The invoice sums the period's records per team." }
          ]
        },
        {
          "title": "formatMoney moves to billing",
          "kind": "move",
          "description": "Moved as is, except it now takes a currency.",
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
          "description": "Built from the credits route; it takes units and a SKU instead of an amount.",
          "ranges": [
            {
              "path": "src/routes/usage.ts",
              "start": 1,
              "end": 29,
              "reference": { "path": "src/routes/credits.ts", "start": 1, "end": 28 }
            }
          ]
        }
      ]
    }

"kind" is one of: flow, refactor, rename, move, copy, schema, generated, config, tests, docs, other. "start" and "end" are 1-based, inclusive line numbers in the new version of the file (the old version for a deleted file). "note" is optional, up to 500 characters. "movedFrom" is optional; its lines are in the old version of a file this change took them out of. "reference" is optional; its lines are in the target branch's version (at {{baseCommit}}) of any text file in the repository. If the response lists problems, fix them and send the whole set again; each request replaces the previous groups.

{{rules}}`;
