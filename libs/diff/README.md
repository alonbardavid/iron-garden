# @lib/diff

The line diff of one changed file, shared by the server and the browser so both see the same
changes.

- `diffLines(before, after)` numbers each line on its side. It is deterministic: past 1000
  edits a file counts as wholly replaced.
- `changesOf(lines)` splits a diff into the changes a reviewer accepts. A removed line and the
  added line that replaced it are one change. Each has a `key` made from its text and the
  unchanged line above it, so a mark survives lines inserted above it in a later revision, and
  an `at` line that bracket ranges are matched against.
- `WHOLE_FILE` is the key of the single change of a file with no lines to show (binary or too
  large).
