import { Group, NavLink, Paper, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { SessionSummary } from "@lib/contract";
import { palette } from "@lib/ds";
import { Card } from "../../components/Card";
import { Page } from "../../components/Page";
import { orpc } from "../../logic/api/orpc";
import { timeAgo } from "../../logic/time";
import { withQuery } from "../../logic/url";
import { useRepository } from "../repository/RepositoryLayout";
import { StartSession, StartSessionGuide } from "../repository/StartSession";
import {
  AgentLine,
  SessionFiles,
  SessionPullRequests,
  SessionState,
} from "./SessionParts";
import { sessionPath, sessionTitle } from "./paths";

const FILTERS = [
  {
    key: "working",
    label: "Working",
    empty: "No sessions are working now",
    match: (s: SessionSummary) => s.status === "active",
  },
  {
    key: "unmerged",
    label: "Unmerged",
    empty: "Nothing unmerged",
    match: (s: SessionSummary) => s.unmerged,
  },
  {
    key: "all",
    label: "All",
    empty: "No sessions",
    match: () => true,
  },
] as const;

type Filter = (typeof FILTERS)[number];

// Every agent session on the repository, whoever's agent runs it: the
// repository's front page.
export const SessionsScreen = () => {
  const { name } = useRepository();
  const { data: sessions } = useQuery(
    orpc.repositories.sessions.list.queryOptions({ input: { name } }),
  );
  return (
    <Page title="Sessions" action={<StartSession repository={name} />}>
      {sessions && sessions.length === 0 ? (
        <NoSessions />
      ) : (
        <FilteredSessions sessions={sessions ?? []} />
      )}
    </Page>
  );
};

const NoSessions = () => {
  const { name } = useRepository();
  return (
    <Card
      title="No agent sessions yet"
      description="Agents working on this repository show here while they work, with their pull requests, until their work is merged."
    >
      <StartSessionGuide repository={name} />
    </Card>
  );
};

const FilteredSessions = ({ sessions }: { sessions: SessionSummary[] }) => {
  const [search] = useSearchParams();
  const current =
    FILTERS.find((f) => f.key === search.get("show")) ?? FILTERS[0];
  const shown = sessions.filter(current.match).sort(liveFirst);
  return (
    <Group align="start" gap={20} wrap="nowrap">
      <FilterNav sessions={sessions} current={current} />
      <Paper withBorder radius="md" style={{ flex: 1 }}>
        <Group px={16} py={12}>
          <Text fw={600}>{current.label}</Text>
          <Text c="dimmed">{shown.length}</Text>
        </Group>
        {shown.length === 0 ? (
          <EmptyFilter text={current.empty} />
        ) : (
          <SessionTable sessions={shown} />
        )}
      </Paper>
    </Group>
  );
};

const FilterNav = ({
  sessions,
  current,
}: {
  sessions: SessionSummary[];
  current: Filter;
}) => {
  const { pathname } = useLocation();
  return (
    <Paper withBorder radius="md" p={6} w={200} style={{ flexShrink: 0 }}>
      <Text size="xs" fw={600} c="dimmed" px={8} pt={10} pb={4}>
        Show
      </Text>
      {FILTERS.map((f) => (
        <NavLink
          key={f.key}
          label={f.label}
          component={Link}
          to={withQuery(pathname, { show: f === FILTERS[0] ? null : f.key })}
          active={f === current}
          rightSection={
            <Text size="xs">{sessions.filter(f.match).length}</Text>
          }
          style={{ borderRadius: 6 }}
        />
      ))}
    </Paper>
  );
};

const EmptyFilter = ({ text }: { text: string }) => (
  <Stack
    align="center"
    py={48}
    gap={4}
    style={{ borderTop: `1px solid ${palette.control}` }}
  >
    <Text fw={600}>{text}</Text>
    <Text size="sm" c="dimmed">
      Agents start sessions through the API; Start session shows how.
    </Text>
  </Stack>
);

// Two columns: the session, with what it is and how it is doing under its
// title, and its pull requests. Fixed layout, so long pull request titles
// truncate instead of squeezing the session.
const SessionTable = ({ sessions }: { sessions: SessionSummary[] }) => (
  <Table
    layout="fixed"
    verticalSpacing={12}
    horizontalSpacing={16}
    highlightOnHover
    highlightOnHoverColor={palette.tint}
  >
    <Table.Thead>
      <Table.Tr>
        <Table.Th>Session</Table.Th>
        <Table.Th w="36%">Pull requests</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </Table.Tbody>
  </Table>
);

const SessionRow = ({ session }: { session: SessionSummary }) => {
  const { name } = useRepository();
  return (
    <Table.Tr>
      <Table.Td>
        <Text component={Link} to={sessionPath(name, session.id)} fw={600}>
          {sessionTitle(session)}
        </Text>
        <Group gap={6} mt={4}>
          <AgentLine session={session} />
          <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            · started {timeAgo(session.createdAt)}
          </Text>
        </Group>
        <Group gap={12} mt={6}>
          <SessionState session={session} />
          <SessionFiles session={session} />
        </Group>
      </Table.Td>
      <Table.Td>
        <SessionPullRequests session={session} />
      </Table.Td>
    </Table.Tr>
  );
};

// Live sessions first; otherwise newest first, as the server sends them.
function liveFirst(a: SessionSummary, b: SessionSummary): number {
  return Number(b.live) - Number(a.live);
}
