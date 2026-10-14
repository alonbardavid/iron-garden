import { useCallback } from "react";
import { signOut } from "./client";

export function useLogout() {
  return useCallback(async () => {
    await signOut();
    window.location.assign("/");
  }, []);
}
