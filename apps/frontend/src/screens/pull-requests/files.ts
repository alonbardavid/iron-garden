import type { PullRequestDetail } from "@lib/contract";

// Files the agent bracketed as generated, whose diffs wait for a click.
export function generatedFiles(pr: PullRequestDetail): Set<string> {
  return new Set(
    pr.groups
      .filter((group) => group.kind === "generated")
      .flatMap((group) => group.ranges.map((range) => range.path)),
  );
}
