import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PathFile, PullRequestDetail } from "@lib/contract";
import { diffLines } from "@lib/diff";
import { orpc } from "../../../logic/api/orpc";
import type { ImageFile } from "../../../components/images";
import { textOf, type DiffLine } from "./model";

export type FileDiff =
  | { lines: DiffLine[] }
  | { reason: string }
  | { images: { before: ImageFile | null; after: ImageFile | null } };

// One changed file's diff, fetched once `enabled`. A file never changes
// within a revision, so its contents are fetched once per head commit.
export function useFileDiff(
  pr: PullRequestDetail,
  path: string,
  enabled = true,
): { diff?: FileDiff; error: Error | null } {
  const { data, error } = useQuery(
    orpc.pullRequests.file.queryOptions({
      input: { name: pr.repository, number: pr.number, path },
      queryKey: ["pull-request-file", pr.id, pr.headCommit, path],
      staleTime: Infinity,
      enabled,
    }),
  );
  const diff = useMemo(() => data && fileDiffOf(data), [data]);
  return { diff, error };
}

// A changed file's two sides as the diff shows them.
export function fileDiffOf(sides: {
  before: PathFile | null;
  after: PathFile | null;
}): FileDiff {
  if (sides.before?.kind === "image" || sides.after?.kind === "image") {
    return {
      images: { before: asImage(sides.before), after: asImage(sides.after) },
    };
  }
  const before = textOf(sides.before);
  const after = textOf(sides.after);
  if ("reason" in before) {
    return before;
  }
  if ("reason" in after) {
    return after;
  }
  return { lines: diffLines(before.text, after.text) };
}

const asImage = (file: PathFile | null): ImageFile | null =>
  file?.kind === "image" ? file : null;
