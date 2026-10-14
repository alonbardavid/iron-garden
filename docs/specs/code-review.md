# Code review

Review in IronGarden is done **line by line, not file by file**. A reviewer marks line
ranges as reviewed; automation groups related lines, links them to the code they came from,
and applies rules that auto-review the boring parts and escalate the risky ones. A change is
ready to merge when every changed line is accounted for.

The deterministic parts (line tracking, carry-over, move detection, path and pattern rules,
artifacts) work without AI. AI adds grouping, precedent finding and prompt-based rules.

## Change requests

A **change request** (the IronGarden pull request) is one unit of review that can span
several branches in several repos of the same instance.

| Field       | Notes                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sources     | One or more `{repo, source branch, target branch}`. Usually one; several for a change that crosses repos (e.g. an API and its client) |
| Revisions   | Every push to any source branch creates a new revision of the whole change request                                                    |
| Context     | Session context from the agents that worked on it ([agent-collaboration.md](./agent-collaboration.md)), plus the description          |
| Competition | Optional link to competing change requests (below)                                                                                    |

**Merging** a multi-repo change request checks that every source merges cleanly and passes its
requirements, then merges each repo in a fixed order. If a later repo fails (for example its
target moved in between), refs already merged are rolled back with compare-and-swap and the
change request reports what happened. Cross-repo merges are therefore all-or-nothing in
effect, though not in a single transaction.

## Lines as the unit of review

- The diff of each source is split into **line ranges** on the new side (deleted lines are
  attached to the range that replaced them, or form their own range).
- A reviewer can mark any set of ranges as reviewed, including a single line. Marks are per
  reviewer and record the revision they were made on.
- Files, groups and images are just ways to select many ranges at once; the record is always
  per range.
- The change request shows progress as lines reviewed, auto-reviewed, needing action, and
  remaining.

### Keeping review marks when a branch is updated

When a source branch gets new commits, each reviewed range from the previous revision is
re-located in the new diff:

| What happened to the range                                    | Result                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Unchanged                                                     | Stays reviewed                                                              |
| Moved as-is (same lines elsewhere, detected by content match) | Stays reviewed, tagged "moved since review" with a link to the old location |
| Unchanged lines but the surrounding chunk changed             | Stays reviewed; the new neighbouring lines are unreviewed                   |
| Edited                                                        | Becomes unreviewed; the UI shows the inter-revision diff of just that range |
| Removed from the change                                       | Mark dropped                                                                |

Line identity uses the line's content plus nearby context, not line numbers, so inserts above a
range do not reset it.

## Groups

When a change request is opened or updated, an automated pass reads the diff (and session
context) and puts line ranges into **groups**. A range can be in several groups.

| Group kind                                | Produced by                                               | Example                                                         |
| ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Rename / mechanical refactor              | Deterministic (same token substitution across many lines) | `getUser` renamed to `fetchUser` in 14 files                    |
| Moved code                                | Deterministic (move detection)                            | A function moved from `a.ts` to `b.ts`                          |
| Imports, formatting, generated, lockfiles | Deterministic (patterns)                                  | Import reordering                                               |
| Flow                                      | AI                                                        | A new field threaded from the API through the service to the UI |
| Impact                                    | AI                                                        | Everything that changes the public API                          |
| Session intent                            | AI, from session context                                  | The lines implementing step 2 of the agent's plan               |

A group has a title, kind, rationale and its ranges, possibly across repos. The review UI can
navigate by group, and marking a group reviewed marks its ranges.

## References

A range can carry **references** to ranges on the target branch:

| Kind         | Meaning                                            | Added by                             |
| ------------ | -------------------------------------------------- | ------------------------------------ |
| `moved-from` | This code was moved from there                     | Move detection, API, or trailer      |
| `precedent`  | This code follows that existing code as an example | AI precedent finder, API, or trailer |

Trailer forms (one per line in the commit message):

```
Code-Moved: src/old.ts:10-40 => src/new.ts:5-35
Code-Precedent: src/routes/users.ts:1-30 => src/routes/teams.ts:1-28
```

The UI shows the referenced code beside the changed lines; for `moved-from` it shows only what
differs from the original.

## Review rules

Rules decide which ranges need what. Each rule matches ranges and applies an action, and every
match annotates the range with the rule's name and reason, so reviewers see why.

**Matchers:** path globs, group kind, content patterns (regex), file status (added, deleted,
renamed), and AI classifiers defined by a prompt (e.g. "is this boilerplate as defined in
`docs/boilerplate.md`?").

**Actions:**

| Action           | Effect                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| `auto-review`    | Range counts as reviewed by the rule                                                 |
| `require-review` | Needs a human review even if a rule auto-reviewed it                                 |
| `require-role`   | Needs review from a given role (e.g. admin, code owner of the path)                  |
| `require-check`  | Needs a named check to pass; dispatches a webhook so CI can run special tests        |
| `flag`           | Adds a visible note (e.g. "new convention introduced", "migration") without blocking |
| `auto-deploy`    | Marks the change as eligible for automatic deploy when everything else passes        |

**Precedence:** requirements always beat auto-review. AI classifiers can trigger `flag` and
`require-*` actions freely, but `auto-review` by an AI classifier must be enabled per rule,
because AI output is untrusted.

**Examples:**

```yaml
rules:
  - name: docs need no review
    match: { paths: ["docs/**"] }
    action: auto-review
  - name: imports and comments
    match: { groups: [imports, formatting], content: ["^\\s*//"] }
    action: auto-review
  - name: migrations
    match: { paths: ["migrations/**"] }
    action: [require-role: admin, require-check: migration-dry-run]
  - name: architecture change
    match:
      {
        ai: "Does this change module boundaries or add a new top-level package?",
      }
    action: [require-review, flag: architecture]
  - name: new convention
    match:
      { ai: "Does this introduce a pattern not used elsewhere in the repo?" }
    action: flag
```

**Where rules live:** `.iron-garden/review-rules.yaml` read from the **target** branch, never the
source branch, so a change cannot approve itself by editing the rules. Instance admins can add
rules that apply to every repo.

## Competing change requests

Change requests can be linked as **competing** (by the agents' sessions being in one
competition, or by hand). Competing changes are shown side by side:

- The diff between the competitors, not only each against the target.
- A comparison table of metrics: size (lines, files), artifact metrics (below), check results,
  and optional AI judging against a prompt (e.g. "which is simpler to maintain?").
- Picking a winner closes the others with a link to it.

## Artifacts

Agents, CI and e2e tests can upload **artifacts** to a change request revision, each under a
key such as `coverage`, `perf/api-p95`, `screenshot/login`.

| Type                                  | Stored   | Compared                                                |
| ------------------------------------- | -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Metric (`{value, unit, better: higher | lower}`) | D1                                                      | Against the previous revision and the target branch's latest value for the same key; shows the delta and whether it improved |
| Image or video                        | R2       | Side by side with the previous artifact of the same key |
| File (reports, logs)                  | R2       | Download only                                           |

Uploads use a token with upload scope; size limits apply per artifact and per revision.

## Visual evidence for lines

An agent can upload an image (or video) and link it to any set of line ranges, not necessarily
contiguous or in one file. A range can have several images.

- The reviewer sees the image next to the linked lines, and the lines next to the image.
- **Approving an image marks all its linked ranges as reviewed** by that reviewer, recorded as
  "approved via image". If a linked range later changes, the image approval no longer covers
  it.

## Ready to merge

A change request can merge when, for every source:

1. Every changed range is reviewed by a human or auto-reviewed by a rule.
2. Every `require-*` action on any range is satisfied.
3. Branch rules (required checks, protected branch) pass.
4. The merge is clean.
