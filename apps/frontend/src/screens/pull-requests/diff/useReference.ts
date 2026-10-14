import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { GroupRange, PullRequestDetail } from "@lib/contract";
import { orpc } from "../../../logic/api/orpc";
import { rangeSlice, textOf, type DiffLine } from "./model";
import { compareWithReference, type ReferenceCompare } from "./reference";

export type Referenced = GroupRange & {
  reference: NonNullable<GroupRange["reference"]>;
};

// A range's added lines against the reference they were copied from, once
// the reference file is read from the target branch and `enabled`.
export function useReferenceCompare(
  pr: PullRequestDetail,
  file: { lines: DiffLine[]; partners: (number | null)[] },
  range: Referenced | null,
  enabled: boolean,
): { compare?: ReferenceCompare; problem?: string } {
  const path = range?.reference.path ?? "";
  const { data, error } = useQuery(
    orpc.pullRequests.reference.queryOptions({
      input: { name: pr.repository, number: pr.number, path },
      queryKey: ["pull-request-reference", pr.id, pr.baseCommit, path],
      staleTime: Infinity,
      enabled: enabled && !!range,
    }),
  );
  return useMemo(() => {
    if (error) {
      return { problem: error.message };
    }
    if (!data || !range) {
      return {};
    }
    if (!data.version) {
      return { problem: `${path} is not on the target branch.` };
    }
    const text = textOf(data.version);
    if ("reason" in text) {
      return { problem: text.reason };
    }
    return {
      compare: compareWithReference(
        file.lines,
        rangeSlice(file.lines, range, false),
        file.partners,
        text.text,
        range.reference,
      ),
    };
  }, [data, error, file.lines, file.partners, range, path]);
}

// The ranges of a file that name a reference.
export function referencedRanges(
  pr: PullRequestDetail,
  path: string,
): Referenced[] {
  return pr.groups.flatMap((g) =>
    g.ranges.filter((r): r is Referenced => r.path === path && !!r.reference),
  );
}
