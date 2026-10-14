import { useQuery } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import type { Me } from "@lib/contract";
import { orpc } from "../api/orpc";

// The signed-in user, null when signed out.
export function useMe(): { me: Me | null; isLoading: boolean } {
  const { data, error, isPending } = useQuery(
    orpc.me.queryOptions({ retry: false }),
  );
  if (error && !(error instanceof ORPCError && error.code === "UNAUTHORIZED")) {
    throw error;
  }
  return { me: data ?? null, isLoading: isPending };
}

// For screens under the signed-in shell, where `me` is always loaded.
export function useSignedInMe(): Me {
  const { me } = useMe();
  if (!me) {
    throw new Error("useSignedInMe outside the signed-in app");
  }
  return me;
}
