import { Box, Group, Skeleton, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import type { PullRequestDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import { NavTab, TabCount } from "../../components/NavTabs";
import {
  ActivityIcon,
  FileIcon,
  GroupsIcon,
  OverviewIcon,
  Spinner,
} from "../../components/icons";
import { orpc } from "../../logic/api/orpc";
import { timeAgo } from "../../logic/time";
import { useRepository } from "../repository/RepositoryLayout";
import { useMe } from "../../logic/authentication/useMe";
import { ActivityTab } from "./ActivityTab";
import { AuthorLine } from "./AuthorLine";
import { ChatDock } from "./chat/ChatDock";
import { ChatProvider } from "./chat/ChatProvider";
import { DiscussionProvider } from "./discussion";
import { FilesTab } from "./FilesTab";
import { GroupsTab } from "./GroupsTab";
import { Markdown } from "../../components/markdown/Markdown";
import { OverviewTab } from "./OverviewTab";
import { ProcessingErrorNotice } from "./ProcessingErrorNotice";
import { pullRequestPath, type PullRequestTab } from "./paths";
import { ReviewProvider } from "./review";
import { ReviewButton } from "./ReviewButton";
import { Loading, SkeletonCard } from "../../components/skeletons";

// A processing pull request changes as soon as it is bracketed.
const PROCESSING_POLL_MS = 5000;

const TABS: PullRequestTab[] = ["overview", "brackets", "files", "activity"];

export const PullRequestScreen = () => {
  const { name } = useRepository();
  const params = useParams();
  const number = Number(params.number);
  const tab: PullRequestTab = TABS.includes(params.tab as PullRequestTab)
    ? (params.tab as PullRequestTab)
    : "overview";
  const { data: pr, error } = useQuery(
    orpc.pullRequests.get.queryOptions({
      input: { name, number },
      refetchInterval: (query) =>
        query.state.data?.status === "processing" ? PROCESSING_POLL_MS : false,
    }),
  );
  if (error) {
    throw error;
  }
  if (!pr) {
    return <PullRequestSkeleton />;
  }
  return (
    <ReviewProvider pr={pr}>
      <DiscussionProvider pr={pr}>
        <PeopleChat pr={pr} tab={tab}>
          <PullRequestHeader pr={pr} tab={tab} />
          <Box px={24} pt={20} pb={64}>
            {tab === "overview" && <OverviewTab pr={pr} />}
            {tab === "brackets" && <GroupsTab pr={pr} />}
            {tab === "files" && <FilesTab pr={pr} />}
            {tab === "activity" && <ActivityTab pr={pr} />}
          </Box>
          <ChatDock />
        </PeopleChat>
      </DiscussionProvider>
    </ReviewProvider>
  );
};

// The header and a first card, shaped as the pull request will load.
const PullRequestSkeleton = () => (
  <Loading>
    <Box bg={palette.surface} px={24} pt={20} pb={14}>
      <Skeleton height={20} width="40%" radius="sm" />
      <Group gap={8} mt={12}>
        <Skeleton height={20} width={64} radius="xl" />
        <Skeleton height={10} width={260} radius="sm" />
      </Group>
      <Group gap={24} mt={22}>
        {[70, 80, 50, 70].map((width, i) => (
          <Skeleton key={i} height={10} width={width} radius="sm" />
        ))}
      </Group>
    </Box>
    <Box px={24} pt={20}>
      <SkeletonCard lines={4} />
    </Box>
  </Loading>
);

const PullRequestHeader = ({
  pr,
  tab,
}: {
  pr: PullRequestDetail;
  tab: PullRequestTab;
}) => (
  <Box bg={palette.surface}>
    <Box px={24} pt={20}>
      <Title
        order={1}
        fz={22}
        fw={400}
        lh={1.3}
        style={{ letterSpacing: "-0.01em" }}
      >
        <Markdown inline>{pr.title}</Markdown>{" "}
        <Text span ff="monospace" fz={16} c={palette.muted}>
          #{pr.number}
        </Text>
      </Title>
      <Group gap={8} mt={8} fz={13} c={palette.secondary}>
        <StatusPill status={pr.status} />
        <AuthorLine pr={pr} />
        <Dot />
        <span>opened {timeAgo(pr.createdAt)}</span>
        <Dot />
        <span>into</span>
        <Text
          span
          ff="monospace"
          fz={12}
          px={6}
          c={palette.accentInk}
          bg={palette.accentSoft}
          style={{ borderRadius: 5 }}
        >
          {pr.targetBranch}
        </Text>
        {pr.revision > 1 && (
          <>
            <Dot />
            <span>revision {pr.revision}</span>
          </>
        )}
      </Group>
      <ProcessingErrorNotice pr={pr} />
    </Box>
    <Group
      mt={12}
      px={24}
      gap={16}
      style={{ borderBottom: `1px solid ${palette.control}` }}
    >
      <Group component="nav" aria-label="Pull request" gap={8}>
        <NavTab
          inPage
          to={pullRequestPath(pr)}
          icon={<OverviewIcon />}
          label="Overview"
          current={tab === "overview"}
        />
        <NavTab
          inPage
          to={pullRequestPath(pr, "brackets")}
          icon={<GroupsIcon />}
          label="Brackets"
          badge={
            pr.status === "processing" ? (
              <Text
                span
                c={palette.pending}
                title="Processing"
                display="inline-flex"
              >
                <Spinner />
              </Text>
            ) : (
              <TabCount n={pr.groups.length} />
            )
          }
          current={tab === "brackets"}
        />
        <NavTab
          inPage
          to={pullRequestPath(pr, "files")}
          icon={<FileIcon />}
          label="Files"
          badge={<TabCount n={pr.files.length} />}
          current={tab === "files"}
        />
        <NavTab
          inPage
          to={pullRequestPath(pr, "activity")}
          icon={<ActivityIcon />}
          label="Activity"
          current={tab === "activity"}
        />
      </Group>
      {pr.status === "processing" && (
        <Group role="status" gap={8} ml="auto" fz={12.5} c={palette.secondary}>
          <Text span c={palette.pending} display="inline-flex">
            <Spinner size={14} />
          </Text>
          Processing · bracketing the changes in {pr.files.length}{" "}
          {pr.files.length === 1 ? "file" : "files"}
        </Group>
      )}
      <Box ml={pr.status === "processing" ? 0 : "auto"} py={8}>
        <PeopleOnly>
          <ReviewButton pr={pr} />
        </PeopleOnly>
      </Box>
    </Group>
  </Box>
);

// Brackets were once called groups: an old link to the Groups tab, and the
// group it picked, opens the Brackets tab.
export const GroupsTabRedirect = () => {
  const params = useParams();
  const [search] = useSearchParams();
  const to = pullRequestPath(
    { repository: params.name!, number: Number(params.number) },
    "brackets",
    { bracket: search.get("group"), file: search.get("file") },
  );
  return <Navigate to={to} replace />;
};

// People chat with the agents listening; agents listen through the API.
const PeopleChat = ({
  pr,
  tab,
  children,
}: {
  pr: PullRequestDetail;
  tab: PullRequestTab;
  children: ReactNode;
}) => {
  const { me } = useMe();
  return me && !me.agent ? (
    <ChatProvider pr={pr} tab={tab}>
      {children}
    </ChatProvider>
  ) : (
    children
  );
};

// Agents review through the API; the review controls are for people.
const PeopleOnly = ({ children }: { children: ReactNode }) => {
  const { me } = useMe();
  return me && !me.agent ? children : null;
};

const Dot = () => (
  <Text span c={palette.faint} aria-hidden>
    ·
  </Text>
);

const PILLS = {
  open: {
    label: "Open",
    bg: palette.successSoft,
    color: palette.successInk,
    dot: palette.added,
  },
  merged: {
    label: "Merged",
    bg: palette.accentSoft,
    color: palette.accentInk,
    dot: palette.accent,
  },
  closed: {
    label: "Closed",
    bg: palette.hover,
    color: palette.secondary,
    dot: palette.faint,
  },
} as const;

// A processing pull request is open while its agent brackets it.
const StatusPill = ({ status }: { status: PullRequestDetail["status"] }) => {
  const pill = PILLS[status === "processing" ? "open" : status];
  return (
    <Group
      gap={6}
      h={24}
      px={10}
      fz={12}
      fw={600}
      bg={pill.bg}
      c={pill.color}
      style={{ borderRadius: 12 }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: pill.dot,
        }}
      />
      {pill.label}
    </Group>
  );
};
