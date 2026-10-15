import { Anchor, Button, Code, Group, Stack, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { SessionOverview } from "@lib/contract";
import { palette } from "@lib/ds";
import { Card } from "../../components/Card";
import { Markdown } from "../../components/markdown/Markdown";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";
import { timeAgo } from "../../logic/time";
import { useRepository } from "../repository/RepositoryLayout";
import { sessionPath } from "./paths";

// The files the session holds: what its agent said it is editing, and what
// its pushed branches change. Exclusive files are marked.
export const WorkingSetCard = ({ session }: { session: SessionOverview }) => {
  const { editing, committed } = session.workingSet;
  return (
    <Card
      title="Working set"
      description="What its agent said it is editing, and what its pushed branches change."
    >
      {editing.length === 0 && committed.length === 0 ? (
        <Text size="sm" c="dimmed">
          No files yet.
        </Text>
      ) : (
        <PathLists workingSet={session.workingSet} />
      )}
    </Card>
  );
};

const PathLists = ({
  workingSet,
}: {
  workingSet: SessionOverview["workingSet"];
}) => {
  const isExclusive = (path: string) => workingSet.exclusive.includes(path);
  const lists = [
    { title: "Editing", paths: workingSet.editing },
    ...workingSet.committed.map((branch) => ({
      title: `Committed on ${branch.branch}`,
      paths: branch.paths,
    })),
  ];
  return (
    <Stack gap={12}>
      {lists.map((list) => (
        <PathList key={list.title} {...list} isExclusive={isExclusive} />
      ))}
    </Stack>
  );
};

const PathList = ({
  title,
  paths,
  isExclusive,
}: {
  title: string;
  paths: string[];
  isExclusive: (path: string) => boolean;
}) =>
  paths.length === 0 ? null : (
    <Stack gap={4}>
      <Text size="xs" fw={600} c={palette.secondary}>
        {title}
      </Text>
      {paths.map((path) => (
        <PathRow key={path} path={path} exclusive={isExclusive(path)} />
      ))}
    </Stack>
  );

const PathRow = ({ path, exclusive }: { path: string; exclusive: boolean }) => (
  <Group gap={8} wrap="nowrap">
    <Text size="sm" ff="monospace" truncate>
      {path}
    </Text>
    {exclusive && (
      <Text span fz={11} fw={600} c={palette.flagInk}>
        exclusive
      </Text>
    )}
  </Group>
);

// Open collisions on exclusive files, either way.
export const CollisionsCard = ({ session }: { session: SessionOverview }) =>
  session.collisions.length === 0 ? null : (
    <Card title="Collisions">
      <Stack gap={8}>
        {session.collisions.map((collision) => (
          <CollisionRow key={collision.id} collision={collision} />
        ))}
      </Stack>
    </Card>
  );

const CollisionRow = ({
  collision,
}: {
  collision: SessionOverview["collisions"][number];
}) => {
  const { name } = useRepository();
  const other = (
    <Anchor component={Link} to={sessionPath(name, collision.other.id)}>
      {collision.other.title ?? collision.other.agent}
    </Anchor>
  );
  return (
    <Text size="sm">
      <Code>{collision.path}</Code>
      {collision.rule && ` (rule ${collision.rule})`}:{" "}
      {collision.caused ? (
        <>this session took it while {other} held it</>
      ) : (
        <>{other} took it while this session held it</>
      )}{" "}
      · {timeAgo(collision.createdAt)}
    </Text>
  );
};

// How other sessions may reach this one outside the platform.
export const ContactCard = ({ session }: { session: SessionOverview }) =>
  !session.contact?.length ? null : (
    <Card title="Contact">
      <Stack gap={4}>
        {session.contact.map((entry) => (
          <Text key={`${entry.kind}:${entry.value}`} size="sm">
            <Text span inherit fw={600}>
              {entry.kind}
            </Text>{" "}
            <Text span inherit ff="monospace">
              {entry.value}
            </Text>
            {entry.note && ` · ${entry.note}`}
          </Text>
        ))}
      </Stack>
    </Card>
  );

// Messages between this session and others, shown to the people who own its
// agent.
export const MessagesCard = ({ session }: { session: SessionOverview }) =>
  session.messages === null ? null : (
    <Card
      title="Messages"
      description="Between this session and other sessions. Only you see them."
    >
      {session.messages.length === 0 ? (
        <Text size="sm" c="dimmed">
          None yet.
        </Text>
      ) : (
        <Stack gap={12}>
          {session.messages.map((message) => (
            <MessageRow key={message.id} session={session} message={message} />
          ))}
        </Stack>
      )}
    </Card>
  );

const MessageRow = ({
  session,
  message,
}: {
  session: SessionOverview;
  message: NonNullable<SessionOverview["messages"]>[number];
}) => {
  const sent = message.fromSessionId === session.id;
  return (
    <Stack
      gap={2}
      pl={10}
      style={{
        borderLeft: `2px solid ${sent ? palette.accentRing : palette.line}`,
      }}
    >
      <Text size="xs" c={palette.secondary}>
        {sent ? "Sent" : `From ${senderName(message.data)}`} ·{" "}
        {timeAgo(message.createdAt)}
      </Text>
      <Markdown>{message.body}</Markdown>
    </Stack>
  );
};

function senderName(data: Record<string, unknown> | null): string {
  const from = data?.from as { agent?: unknown; title?: unknown } | undefined;
  const title = typeof from?.title === "string" ? from.title : null;
  const agent = typeof from?.agent === "string" ? from.agent : "a session";
  return title ? `${title} (${agent})` : agent;
}

// An ended session's pushed branches that never got a pull request.
export const UnmergedBranchesCard = ({
  session,
}: {
  session: SessionOverview;
}) =>
  session.unmergedBranches.length === 0 ? null : (
    <Card
      title="Unmerged branches"
      description="Pushed, with no pull request processing or open. Their files still count as edited."
    >
      <Text size="sm" ff="monospace">
        {session.unmergedBranches.join(", ")}
      </Text>
      {session.canDismiss && <DismissButton session={session} />}
    </Card>
  );

const DismissButton = ({ session }: { session: SessionOverview }) => {
  const dismiss = useDismiss(session.id);
  return (
    <Group>
      <Button
        variant="default"
        size="xs"
        loading={dismiss.busy}
        onClick={dismiss.run}
      >
        Dismiss unmerged work
      </Button>
      {dismiss.error && (
        <Text size="sm" c="red">
          {dismiss.error}
        </Text>
      )}
    </Group>
  );
};

function useDismiss(id: string) {
  const { name } = useRepository();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      await orpc.repositories.sessions.dismiss.call({ name, id });
      await queryClient.invalidateQueries({
        queryKey: orpc.repositories.sessions.key(),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
