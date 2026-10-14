import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../../../../logic/api/orpc";

export function useGithubConnection(name: string) {
  return useQuery(
    orpc.repositories.github.get.queryOptions({ input: { name } }),
  );
}

export function useWebhookAccess(name: string) {
  return useQuery(
    orpc.repositories.github.webhookAccess.queryOptions({ input: { name } }),
  );
}

// Connecting, changing the webhook, syncing and disconnecting all change what
// the repository shows, so each refreshes the connection and the runs.
export function useGithubActions(name: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.repositories.github.key(),
    });
  return {
    connect: async (input: {
      owner: string;
      repo: string;
      tokenId: string;
    }) => {
      await orpc.repositories.github.connect.call({ name, ...input });
      await refresh();
    },
    setUpWebhook: async () => {
      await orpc.repositories.github.setUpWebhook.call({ name });
      await refresh();
    },
    removeWebhook: async () => {
      await orpc.repositories.github.removeWebhook.call({ name });
      await refresh();
    },
    sync: async () => {
      await orpc.repositories.github.sync.call({ name });
      await refresh();
    },
    disconnect: async () => {
      await orpc.repositories.github.disconnect.call({ name });
      await refresh();
    },
  };
}
