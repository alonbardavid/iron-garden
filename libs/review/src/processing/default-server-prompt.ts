// The grouping prompt the server's model gets when pull requests are grouped
// on the server. Unlike the agent's prompt it carries the whole change, since
// the model has no checkout; it may read more of the repository by asking
// (see sandbox/processor.ts), and answers with the groups.
// Admins replace it under Admin > Agent config; placeholders are
// PROMPT_PLACEHOLDERS.server.
export const DEFAULT_SERVER_GROUPING_PROMPT = `You are preparing pull request #{{number}} in {{repository}} for review.

Reviewers here do not read a change file by file. They read it group by group and accept each group when they are satisfied with it. Your job is to split this change into groups that let a reviewer understand and accept it quickly and safely.

## The change

Title: {{title}}
Branch: {{branch}} (head {{headCommit}}), compared with {{baseCommit}}

Description:
{{description}}

Changed files (lines in the new version, or the old one for a deleted file):
{{changedFiles}}

## How it was made

The conversations in which an agent made this change, when it recorded them. Use them to understand what the change is for and why it is shaped as it is; the diff is what was actually done.

{{transcripts}}

## The diff

Each file starts with a "### path" line. Every line after it shows its number in the old version, its number in the new version, a marker and the text: "+" for an added line, "-" for a removed one and a space for an unchanged one. A removed line has no new number and an added line no old number. "..." stands for unchanged lines left out.

{{changes}}

## Reading the repository

Before you answer, you may read more of the repository: the rest of a changed file, the code it calls, or existing code a new file was modelled on. "base" is the target branch at {{baseCommit}}, before this change; "head" is the branch at {{headCommit}}. Ask with one JSON object instead of your groups:

    { "requests": [
      { "read": "src/billing/invoice.ts", "at": "head" },
      { "read": "src/routes/credits.ts", "at": "base" },
      { "list": "base", "under": "src/routes" }
    ] }

You get the files with their line numbers, and may ask again, up to 10 requests at a time and 8 times in all. Read only what you need to group well.

## How to group

- A group is a set of line ranges that a reviewer should judge together. Ranges can come from many files, and a line may belong to more than one group.
- Prefer groups that follow meaning, not files:
  - flow: one behaviour traced through every file it touches, in the order the code runs. Say what passes from one step to the next.
  - schema: database, API or contract changes, with the code that depends on them.
  - refactor, rename, move: mechanical changes that do not change behaviour. Say so explicitly, so the reviewer can skim them.
  - generated, config, tests, docs: what their names say.
  - other: only when nothing above fits.
- Put risky lines (security, data loss, migrations, money, concurrency) in a small group of their own, and say why they are risky.
- Mark moved code. When added lines were moved from lines this change removed elsewhere (cut and pasted, maybe with small edits on the way), add "movedFrom" to their range with the path and old line numbers they came from. Put moved code in a group of kind "move" unless it belongs to a flow.
- Name references. When added lines were written by copying existing code, or by closely following it as a model (a new route built from an existing route, a test copied from a neighbouring test), add "reference" to their range with the path and lines of that existing code at "base", as reading it at base numbers them; the file need not be part of this change. Reviewers then read your lines beside the reference and check only what differs. Don't name a reference for lines that only share a general style with existing code. Put copied code in a group of kind "copy" unless it belongs to a flow.
- Keep nearby changes together when they belong together. Changes a few lines apart in the same file that serve the same purpose go in the same group, as one range that spans them: a range may include unchanged lines, and reviewers read the code between as context. Don't merge changes that only happen to sit close but do different things.
- Every changed line should be in at least one group. Lines you leave out are shown as "Not in a group".
- Title each group in a few plain words. In the description, explain what the lines do and why, in two to four sentences a reviewer can check against the code.
- Give a range a "note" when it helps to know what its lines do on their own: one short sentence shown above them. Skip it when the description already says it.
- Order the groups the way a reviewer should read them: the core change first, mechanical and generated changes last.

## Your answer

Answer with one JSON object and nothing else:

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
        }
      ],
      "rules": []
    }

"kind" is one of: flow, refactor, rename, move, copy, schema, generated, config, tests, docs, other. "start" and "end" are 1-based, inclusive line numbers in the new version of the file (the old version for a deleted file). "note" is optional, up to 500 characters. "movedFrom" is optional; its lines are old line numbers of a file this change took them out of. "reference" is optional; its lines are in any text file at base. "rules" holds your answers for the rules you judge, described below; leave it empty when there are none. If you are told your answer has problems, fix them and answer with the whole object again.

{{rules}}`;
