import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type {
  GithubPullStatus,
  MergeMethod,
  PullRequestDetail,
} from "@lib/contract";
import { orpc } from "../../logic/api/orpc";
import { useRepository } from "../repository/RepositoryLayout";

// While anything on GitHub is still running, look again this often.
const RUNNING_REFRESH_MS = 15_000;

// What GitHub says about the pull request. Reading it can link a GitHub pull
// request or carry a merge or close over, so the pull request is reloaded
// when GitHub's answer disagrees with it.
export function useGithubPull(pr: PullRequestDetail) {
  const { name } = useRepository();
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.pullRequests.github.queryOptions({
      input: { name, number: pr.number },
      refetchInterval: (q) =>
        q.state.data && isRunning(q.state.data) ? RUNNING_REFRESH_MS : false,
    }),
  );
  const pull = query.data?.pull;
  const stale =
    !!pull &&
    (pr.github?.number !== pull.number ||
      pr.github?.state !== pull.state ||
      (pull.state === "merged" && pr.status !== "merged") ||
      (pull.state === "closed" && pr.status !== "closed"));
  useEffect(() => {
    if (stale) {
      void queryClient.invalidateQueries({
        queryKey: orpc.pullRequests.key(),
      });
    }
  }, [stale, queryClient]);
  return query;
}

export function useMergeActions(pr: PullRequestDetail) {
  const { name } = useRepository();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.pullRequests.key() });
  return {
    merge: async (method: MergeMethod) => {
      await orpc.pullRequests.merge.call({ name, number: pr.number, method });
      await refresh();
    },
    createInGithub: async () => {
      await orpc.pullRequests.createInGithub.call({ name, number: pr.number });
      await refresh();
    },
  };
}

function isRunning(status: GithubPullStatus): boolean {
  return (
    status.checks.some((check) => check.status !== "completed") ||
    status.runs.some((run) => run.status !== "completed")
  );
}
