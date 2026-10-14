import { Group, Skeleton } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import type { RepositoryDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import { AppHeader } from "../../components/AppHeader";
import { NavTab, TabCount } from "../../components/NavTabs";
import {
  CodeIcon,
  PullRequestsIcon,
  SettingsIcon,
  WorkflowsIcon,
} from "../../components/icons";
import { orpc } from "../../logic/api/orpc";
import { SkeletonCards } from "../../components/skeletons";
import { Page } from "../../components/Page";

const RepositoryContext = createContext<RepositoryDetail | null>(null);

export function useRepository(): RepositoryDetail {
  const repository = useContext(RepositoryContext);
  if (!repository) {
    throw new Error("useRepository outside RepositoryLayout");
  }
  return repository;
}

// Header, Code / Pull requests / Workflows / Settings tabs, and the repository for the
// screens below.
export const RepositoryLayout = () => {
  const { name = "" } = useParams();
  const { data: repository, error } = useQuery(
    orpc.repositories.get.queryOptions({ input: { name } }),
  );
  if (error) {
    throw error;
  }
  if (!repository) {
    return (
      <>
        <AppHeader crumbs={[{ label: name }]} />
        <Page title={<Skeleton height={22} width={220} radius="sm" />}>
          <SkeletonCards count={2} />
        </Page>
      </>
    );
  }
  return (
    <RepositoryContext.Provider value={repository}>
      <AppHeader
        crumbs={[{ label: repository.name, to: `/r/${repository.name}` }]}
      >
        <RepositoryTabs repository={repository} />
      </AppHeader>
      <Outlet />
    </RepositoryContext.Provider>
  );
};

const RepositoryTabs = ({ repository }: { repository: RepositoryDetail }) => {
  const { pathname } = useLocation();
  const base = `/r/${repository.name}`;
  const current = (["pulls", "workflows", "settings"] as const).find((tab) =>
    pathname.startsWith(`${base}/${tab}`),
  );
  const { data: pullRequests } = useQuery(
    orpc.pullRequests.list.queryOptions({ input: { name: repository.name } }),
  );
  const open = pullRequests?.filter(
    (pr) => pr.status === "open" || pr.status === "processing",
  ).length;
  return (
    <Group
      component="nav"
      aria-label="Repository"
      gap={8}
      px={24}
      style={{ borderBottom: `1px solid ${palette.control}` }}
    >
      <NavTab
        to={base}
        icon={<CodeIcon />}
        label="Code"
        current={current === undefined}
      />
      <NavTab
        to={`${base}/pulls`}
        icon={<PullRequestsIcon />}
        label="Pull requests"
        badge={open !== undefined && <TabCount n={open} />}
        current={current === "pulls"}
      />
      <WorkflowsTab base={base} current={current === "workflows"} />
      {repository.level === "admin" && (
        <NavTab
          to={`${base}/settings`}
          icon={<SettingsIcon />}
          label="Settings"
          current={current === "settings"}
        />
      )}
    </Group>
  );
};

// Only a repository mirrored from GitHub has workflow runs.
const WorkflowsTab = ({
  base,
  current,
}: {
  base: string;
  current: boolean;
}) => {
  const { name } = useRepository();
  const { data: connection } = useQuery(
    orpc.repositories.github.get.queryOptions({ input: { name } }),
  );
  if (!connection) {
    return null;
  }
  return (
    <NavTab
      to={`${base}/workflows`}
      icon={<WorkflowsIcon />}
      label="Workflows"
      current={current}
    />
  );
};
