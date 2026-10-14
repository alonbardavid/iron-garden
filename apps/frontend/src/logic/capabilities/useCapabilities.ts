import { useQuery } from "@tanstack/react-query";
import type { Capabilities } from "@lib/contract";
import { orpc } from "../api/orpc";

export function useCapabilities(): {
  capabilities: Capabilities | null;
  isLoading: boolean;
} {
  const { data, isPending } = useQuery(
    orpc.capabilities.get.queryOptions({ staleTime: Infinity }),
  );
  return { capabilities: data ?? null, isLoading: isPending };
}
