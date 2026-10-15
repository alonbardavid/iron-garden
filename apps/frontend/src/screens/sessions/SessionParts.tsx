import { Group, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { SessionSummary } from "@lib/contract";
import { palette } from "@lib/ds";
import { timeAgo } from "../../logic/time";
import { AuthorLine } from "../pull-requests/AuthorLine";
import { pullRequestPath } from "../pull-requests/paths";
import { StatusPill } from "../pull-requests/StatusPill";
import { useRepository } from "../repository/RepositoryLayout";

// The agent running a session and the person it acts for.
export const AgentLine = ({
  session,
}: {
  session: Pick<SessionSummary, "agent">;
}) => (
  <AuthorLine pr={{ origin: "agent", agent: session.agent, openedBy: null }} />
);

// Live, idle since the agent last called in, or ended.
export const SessionState = ({
  session,
}: {
  session: Pick<SessionSummary, "status" | "live" | "lastSeenAt" | "endedAt">;
}) => {
  const state = describeState(session);
  return (
    <Group gap={6} wrap="nowrap" fz={13} c={state.color}>
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: state.dot,
          flexShrink: 0,
        }}
      />
      <Text span inherit>
        {state.label}
      </Text>
    </Group>
  );
};

// How many files the session holds, and a badge for its open collisions.
export const SessionFiles = ({
  session,
}: {
  session: Pick<SessionSummary, "fileCount" | "collisionCount">;
}) => (
  <Group gap={8} wrap="nowrap">
    <Text size="sm" c={session.fileCount ? undefined : "dimmed"}>
      {session.fileCount === 1 ? "1 file" : `${session.fileCount} files`}
    </Text>
    {session.collisionCount > 0 && (
      <CollisionBadge count={session.collisionCount} />
    )}
  </Group>
);

export const CollisionBadge = ({ count }: { count: number }) => (
  <Text
    span
    px={6}
    fz={11}
    fw={600}
    lh="18px"
    c={palette.dangerInk}
    bg={palette.dangerSoft}
    style={{ borderRadius: 9, whiteSpace: "nowrap" }}
  >
    {count === 1 ? "1 collision" : `${count} collisions`}
  </Text>
);

export const SessionPullRequests = ({
  session,
}: {
  session: Pick<SessionSummary, "pullRequests">;
}) =>
  session.pullRequests.length === 0 ? (
    <Text size="sm" c="dimmed">
      None yet
    </Text>
  ) : (
    <Stack gap={6}>
      {session.pullRequests.map((pr) => (
        <SessionPullRequest key={pr.number} pr={pr} />
      ))}
    </Stack>
  );

const SessionPullRequest = ({
  pr,
}: {
  pr: SessionSummary["pullRequests"][number];
}) => {
  const { name } = useRepository();
  return (
    <Group gap={8} wrap="nowrap">
      <StatusPill status={pr.status} />
      <Text
        component={Link}
        to={pullRequestPath({ repository: name, number: pr.number })}
        size="sm"
        truncate
        miw={0}
      >
        <Text span inherit ff="monospace" c="dimmed">
          #{pr.number}
        </Text>{" "}
        {pr.title}
      </Text>
    </Group>
  );
};

function describeState(
  session: Pick<SessionSummary, "status" | "live" | "lastSeenAt" | "endedAt">,
) {
  if (session.status === "ended") {
    return {
      label: session.endedAt ? `Ended ${timeAgo(session.endedAt)}` : "Ended",
      color: palette.secondary,
      dot: palette.faint,
    };
  }
  if (session.live) {
    return { label: "Live", color: palette.successInk, dot: palette.added };
  }
  return {
    label: session.lastSeenAt
      ? `Idle, last seen ${timeAgo(session.lastSeenAt)}`
      : "Idle",
    color: palette.warningInk,
    dot: palette.pending,
  };
}
