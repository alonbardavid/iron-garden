import { Anchor, Box, Group, Stack, Table, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { SessionOverview } from "@lib/contract";
import { palette } from "@lib/ds";
import { Card } from "../../components/Card";
import { OverviewIcon, TranscriptIcon } from "../../components/icons";
import { Markdown } from "../../components/markdown/Markdown";
import { NavTab, TabCount } from "../../components/NavTabs";
import { Page } from "../../components/Page";
import { orpc } from "../../logic/api/orpc";
import { formatDate, timeAgo } from "../../logic/time";
import { useRepository } from "../repository/RepositoryLayout";
import { SessionChatDock } from "./SessionChat";
import { AgentLine, SessionPullRequests, SessionState } from "./SessionParts";
import {
  SESSION_TABS,
  sessionPath,
  sessionTitle,
  type SessionTab,
} from "./paths";
import { TranscriptsCard } from "./SessionTranscripts";
import {
  CollisionsCard,
  ContactCard,
  MessagesCard,
  UnmergedBranchesCard,
  WorkingSetCard,
} from "./SessionWork";

// An active session's page is read again this often, for what its agent
// reports and uploads as it goes.
const ACTIVE_REFRESH_MS = 30_000;

// One session as anyone who can read the repository sees it: what it set out
// to do, who runs it, how it is doing and its pull requests; its
// conversations; and, for the person the agent works for, a chat with it.
export const SessionScreen = () => {
  const { name } = useRepository();
  const { id = "" } = useParams();
  const { data: session, error } = useQuery(
    orpc.repositories.sessions.get.queryOptions({
      input: { name, id },
      refetchInterval: (query) =>
        query.state.data?.status === "active" ? ACTIVE_REFRESH_MS : false,
    }),
  );
  if (error) {
    throw error;
  }
  return session ? <SessionPage session={session} /> : null;
};

const SessionPage = ({ session }: { session: SessionOverview }) => {
  const tab = useSessionTab();
  return (
    <Page maw={960} title={<SessionHeader session={session} tab={tab} />}>
      {tab === "overview" ? (
        <OverviewTab session={session} />
      ) : (
        <ConversationsTab session={session} />
      )}
      {session.canChat && <ChatDockSpace session={session} />}
    </Page>
  );
};

function useSessionTab(): SessionTab {
  const { tab } = useParams();
  return SESSION_TABS.find((t) => t === tab) ?? "overview";
}

// Room below the page's last card for the dock to rest over.
const ChatDockSpace = ({ session }: { session: SessionOverview }) => (
  <Box h={96}>
    <SessionChatDock session={session} />
  </Box>
);

const OverviewTab = ({ session }: { session: SessionOverview }) => (
  <Stack gap={16}>
    <MarkdownCard title="Goal" text={session.goal} />
    <MarkdownCard title="Context" text={session.context} />
    <CollisionsCard session={session} />
    <Card title="Pull requests">
      <SessionPullRequests session={session} />
    </Card>
    <UnmergedBranchesCard session={session} />
    <WorkingSetCard session={session} />
    <ContactCard session={session} />
    <Card title="Details">
      <SessionDetails session={session} />
    </Card>
  </Stack>
);

// What its agent was asked and did, and what it said to other sessions.
const ConversationsTab = ({ session }: { session: SessionOverview }) => (
  <Stack gap={16}>
    <TranscriptsCard session={session} />
    <MessagesCard session={session} />
  </Stack>
);

const SessionHeader = ({
  session,
  tab,
}: {
  session: SessionOverview;
  tab: SessionTab;
}) => {
  const { name } = useRepository();
  return (
    <Stack gap={4} w="100%">
      <Anchor component={Link} to={`/r/${name}`} fz={13}>
        ← Sessions
      </Anchor>
      <Title order={2} fw={400} fz={24}>
        {sessionTitle(session)}
      </Title>
      <Group gap={12}>
        <AgentLine session={session} />
        <SessionState session={session} />
      </Group>
      <SessionTabs session={session} tab={tab} />
    </Stack>
  );
};

const SessionTabs = ({
  session,
  tab,
}: {
  session: SessionOverview;
  tab: SessionTab;
}) => {
  const { name } = useRepository();
  return (
    <Box mt={8} style={{ borderBottom: `1px solid ${palette.control}` }}>
      <Group component="nav" aria-label="Session" gap={8}>
        <NavTab
          inPage
          to={sessionPath(name, session.id)}
          icon={<OverviewIcon />}
          label="Overview"
          current={tab === "overview"}
        />
        <NavTab
          inPage
          to={sessionPath(name, session.id, "conversations")}
          icon={<TranscriptIcon />}
          label="Conversations"
          badge={<TabCount n={conversationCount(session)} />}
          current={tab === "conversations"}
        />
      </Group>
    </Box>
  );
};

function conversationCount(session: SessionOverview): number {
  return session.transcripts.length + (session.messages?.length ?? 0);
}

const MarkdownCard = ({
  title,
  text,
}: {
  title: string;
  text: string | null;
}) =>
  text ? (
    <Card title={title}>
      <Markdown>{text}</Markdown>
    </Card>
  ) : null;

const SessionDetails = ({ session }: { session: SessionOverview }) => (
  <Table variant="vertical" withRowBorders={false} verticalSpacing={4}>
    <Table.Tbody>
      {detailRows(session).map(([label, value]) => (
        <Table.Tr key={label}>
          <Table.Th w={140} fw={500} c="dimmed">
            {label}
          </Table.Th>
          <Table.Td>{value}</Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);

function detailRows(session: SessionOverview): [string, string][] {
  const base = session.baseCommit
    ? `${session.baseBranch} at ${session.baseCommit.slice(0, 7)}`
    : `${session.baseBranch} (empty)`;
  return [
    [
      "Started",
      `${formatDate(session.createdAt)}, ${timeAgo(session.createdAt)}`,
    ],
    ["Forked from", base],
    ["Client", session.client ?? "Not given"],
    [
      "Last seen",
      session.lastSeenAt ? timeAgo(session.lastSeenAt) : "Not since it started",
    ],
    ...(session.endedAt
      ? [["Ended", timeAgo(session.endedAt)] as [string, string]]
      : []),
  ];
}
