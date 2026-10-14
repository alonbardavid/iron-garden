import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../../logic/api/orpc";
import { useRepository } from "../RepositoryLayout";
import { useCodeRef } from "./codeRef";

// Every file path at the commit being browsed, fetched once per commit and
// only when `enabled`.
export function useRepositoryFiles(enabled: boolean) {
  const { name } = useRepository();
  const { commit } = useCodeRef();
  const { data, error } = useQuery(
    orpc.repositories.files.queryOptions({
      input: { name, ref: commit.hash },
      staleTime: Infinity,
      enabled,
    }),
  );
  return { files: data, error };
}
