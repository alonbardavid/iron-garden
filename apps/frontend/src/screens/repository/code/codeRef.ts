import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { Commit } from "@lib/contract";
import { orpc } from "../../../logic/api/orpc";
import { useRepository } from "../RepositoryLayout";
import { codePath, isCommitHash } from "./paths";

export interface CodeRef {
  // As the URL names it, a branch or a commit; undefined for the default
  // branch.
  ref?: string;
  // The commit it is at.
  commit: Commit;
}

export const CodeRefContext = createContext<CodeRef | null>(null);

export function useCodeRef(): CodeRef {
  const codeRef = useContext(CodeRefContext);
  if (!codeRef) {
    throw new Error("useCodeRef outside CodeRefContext");
  }
  return codeRef;
}

// Where a path is shown at the ref being browsed.
export function useCodeLink(): (path: string) => string {
  const { name } = useRepository();
  const { ref } = useCodeRef();
  return (path) => codePath(name, path, ref);
}

// The commit ref is at: undefined while loading, null when ref names no
// branch or commit. A commit hash never moves, so it is asked about once.
export function useRefCommit(ref?: string): {
  commit?: Commit | null;
  error: Error | null;
} {
  const { name } = useRepository();
  const { data, error } = useQuery(
    orpc.repositories.commits.queryOptions({
      input: { name, ref, limit: 1 },
      staleTime: ref && isCommitHash(ref) ? Infinity : undefined,
    }),
  );
  return { commit: data && (data.commits[0] ?? null), error };
}
