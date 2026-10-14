import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RepositoryListItem } from "@lib/contract";
import { palette } from "@lib/ds";
import { AppHeader } from "../../components/AppHeader";
import {
  BranchIcon,
  GithubIcon,
  MembersIcon,
  PullRequestsIcon,
  SessionIcon,
} from "../../components/icons";
import { Page } from "../../components/Page";
import { orpc } from "../../logic/api/orpc";
import { useSignedInMe } from "../../logic/authentication/useMe";
import { timeAgo } from "../../logic/time";
import { Loading, SkeletonText } from "../../components/skeletons";
import { NewRepositoryModal } from "./NewRepositoryModal";
import board from "../../components/board.module.css";
import classes from "./repositories.module.css";

export const RepositoriesScreen = () => {
  const me = useSignedInMe();
  const [creating, setCreating] = useState(false);
  const { data: repositories } = useQuery(
    orpc.repositories.list.queryOptions(),
  );
  const isAdmin = me.role === "admin";
  return (
    <>
      <AppHeader />
      <Page
        title="Repositories"
        action={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>New repository</Button>
          )
        }
      >
        {repositories ? (
          <RepositoryList repositories={repositories} isAdmin={isAdmin} />
        ) : (
          <RepositoryGridSkeleton />
        )}
      </Page>
      <NewRepositoryModal
        opened={creating}
        onClose={() => setCreating(false)}
      />
    </>
  );
};

const RepositoryList = ({
  repositories,
  isAdmin,
}: {
  repositories: RepositoryListItem[];
  isAdmin: boolean;
}) => {
  if (repositories.length === 0) {
    return (
      <Paper withBorder radius="lg" p={48}>
        <Stack align="center" gap={4}>
          <Text fw={600}>No repositories yet</Text>
          <Text size="sm" c="dimmed">
            {isAdmin
              ? "Create the first one with New repository."
              : "Ask an admin to add you to one."}
          </Text>
        </Stack>
      </Paper>
    );
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing={16}>
      {repositories.map((repo) => (
        <RepositoryCard key={repo.id} repo={repo} />
      ))}
    </SimpleGrid>
  );
};

// A repository at a glance: what it is, what is going on in it, and what you
// may do there. The whole card goes to it.
const RepositoryCard = ({ repo }: { repo: RepositoryListItem }) => {
  const { stats } = repo;
  return (
    <Paper
      component={Link}
      to={`/r/${repo.name}`}
      withBorder
      radius="lg"
      p={18}
      className={classes.card}
      aria-label={repo.name}
    >
      <Stack gap={14} h="100%">
        <Group gap={12} wrap="nowrap" align="center">
          <Monogram name={repo.name} />
          <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={600} fz={15} c={palette.ink} truncate>
              {repo.name}
            </Text>
            <Text fz={12} c={palette.muted}>
              Updated {timeAgo(repo.updatedAt)}
            </Text>
          </Stack>
          <LevelBadge level={repo.level} />
        </Group>
        <Text
          fz={13}
          c={repo.description ? palette.body : palette.faint}
          lineClamp={2}
          mih={40}
        >
          {repo.description ?? "No description"}
        </Text>
        <Group gap={6} mt="auto">
          <Stat
            icon={<PullRequestsIcon size={14} />}
            label={plural(stats.openPullRequests, "open pull request")}
            value={stats.openPullRequests}
            highlight={stats.openPullRequests > 0}
          />
          <Stat
            icon={<SessionIcon />}
            label={plural(stats.activeSessions, "active session")}
            value={stats.activeSessions}
            highlight={stats.activeSessions > 0}
          />
          <Stat
            icon={<MembersIcon />}
            label={plural(stats.members, "member")}
            value={stats.members}
          />
        </Group>
        <Group
          gap={14}
          pt={12}
          style={{ borderTop: `1px solid ${palette.line}` }}
          wrap="nowrap"
        >
          <Group gap={5} wrap="nowrap" c={palette.meta}>
            <BranchIcon size={13} />
            <Text ff="monospace" fz={12} truncate>
              {repo.defaultBranch}
            </Text>
          </Group>
          {stats.github && (
            <Group
              gap={5}
              wrap="nowrap"
              c={palette.meta}
              style={{ minWidth: 0 }}
              title={`Mirrors github.com/${stats.github.owner}/${stats.github.repo}`}
            >
              <GithubIcon size={13} />
              <Text fz={12} truncate>
                {stats.github.owner}/{stats.github.repo}
              </Text>
            </Group>
          )}
        </Group>
      </Stack>
    </Paper>
  );
};

// Cards shaped like the repository cards, while they load.
const RepositoryGridSkeleton = () => (
  <Loading>
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing={16}>
      {[0, 1, 2].map((i) => (
        <RepositoryCardSkeleton key={i} />
      ))}
    </SimpleGrid>
  </Loading>
);

const RepositoryCardSkeleton = () => (
  <Paper withBorder radius="lg" p={18}>
    <Stack gap={14}>
      <Group gap={12} wrap="nowrap">
        <Skeleton height={36} width={36} radius={10} />
        <Stack gap={8} style={{ flex: 1 }}>
          <Skeleton height={13} width="45%" radius="sm" />
          <Skeleton height={9} width="30%" radius="sm" />
        </Stack>
      </Group>
      <SkeletonText lines={2} />
      <Group gap={6}>
        <Skeleton height={24} width={44} radius={6} />
        <Skeleton height={24} width={44} radius={6} />
        <Skeleton height={24} width={44} radius={6} />
      </Group>
      <Skeleton height={9} width="25%" radius="sm" mt={10} />
    </Stack>
  </Paper>
);

// A colored tile with the repository's initial; its hue comes from the name,
// so a repository keeps its color.
const Monogram = ({ name }: { name: string }) => {
  const hue = [...name].reduce((sum, c) => sum + c.charCodeAt(0) * 7, 0) % 360;
  return (
    <span
      aria-hidden="true"
      className={`${classes.monogram} ${board.hex}`}
      style={{ "--hue": hue } as CSSProperties}
    >
      {name[0]!.toUpperCase()}
    </span>
  );
};

const LEVEL_COLORS = { admin: "brand", write: "teal", read: "gray" } as const;

const LevelBadge = ({ level }: { level: RepositoryListItem["level"] }) => (
  <Badge
    variant="light"
    color={LEVEL_COLORS[level]}
    size="sm"
    radius="sm"
    style={{ flexShrink: 0 }}
    title={`You have ${level} access`}
  >
    {level}
  </Badge>
);

const Stat = ({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) => (
  <Group
    gap={5}
    px={8}
    h={24}
    wrap="nowrap"
    title={label}
    aria-label={label}
    style={{
      borderRadius: 6,
      background: highlight ? palette.accentSoft : palette.chip,
      color: highlight ? palette.accentInk : palette.secondary,
    }}
  >
    {icon}
    <Text fz={12} fw={600} c="inherit">
      {value}
    </Text>
  </Group>
);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
