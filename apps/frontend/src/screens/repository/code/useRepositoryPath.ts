import { useQuery } from "@tanstack/react-query";
import type { PathContents } from "@lib/contract";
import { orpc } from "../../../logic/api/orpc";
import { useRepository } from "../RepositoryLayout";
import { useCodeRef } from "./codeRef";

// What a path names at the commit being browsed. A commit never changes, so
// each path is fetched once per commit.
export function useRepositoryPath(path: string): {
  contents?: PathContents;
  error: Error | null;
} {
  const { name } = useRepository();
  const { commit } = useCodeRef();
  const { data, error } = useQuery(
    orpc.repositories.contents.queryOptions({
      input: { name, ref: commit.hash, path },
      staleTime: Infinity,
    }),
  );
  return { contents: data, error };
}
