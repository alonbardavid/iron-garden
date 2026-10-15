import { Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { SessionOverview } from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../components/board.module.css";
import { Card } from "../../components/Card";
import { ChevronIcon, TranscriptIcon } from "../../components/icons";
import { orpc } from "../../logic/api/orpc";
import { timeAgo } from "../../logic/time";
import { NO_FILE_LINKS } from "../pull-requests/notes/FileLinks";
import { shortSha } from "../pull-requests/notes/parts";
import {
  TranscriptChat,
  TranscriptLoading,
} from "../pull-requests/notes/Transcript";
import { useRepository } from "../repository/RepositoryLayout";

type TranscriptSummary = SessionOverview["transcripts"][number];

// While a session works, its agent uploads what it was asked and what it did
// as it goes; an open transcript no commit names yet is read again this often.
const GROWING_REFRESH_MS = 30_000;

// What the session's agent was asked and what it did, one transcript per
// commit, newest first with the newest open.
export const TranscriptsCard = ({ session }: { session: SessionOverview }) => (
  <Card
    title="Transcripts"
    description="What its agent was asked and what it did, uploaded as it goes, one transcript per commit."
  >
    {session.transcripts.length === 0 ? (
      <Text size="sm" c="dimmed">
        None yet. The session prompt asks its agent to upload after each request
        it finishes.
      </Text>
    ) : (
      <TranscriptList session={session} />
    )}
  </Card>
);

const TranscriptList = ({ session }: { session: SessionOverview }) => (
  <Stack gap={8}>
    {session.transcripts.map((transcript, i) => (
      <SessionTranscript
        key={transcript.id}
        session={session}
        transcript={transcript}
        initiallyOpen={i === 0}
      />
    ))}
  </Stack>
);

const SessionTranscript = ({
  session,
  transcript,
  initiallyOpen,
}: {
  session: SessionOverview;
  transcript: TranscriptSummary;
  initiallyOpen: boolean;
}) => {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Box
      style={{ border: `1px solid ${palette.line}`, borderRadius: 8 }}
      bg={palette.surface}
    >
      <TranscriptHeader
        transcript={transcript}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && (
        <Box px={16} py={14} style={{ borderTop: `1px solid ${palette.line}` }}>
          <TranscriptBody session={session} transcript={transcript} />
        </Box>
      )}
    </Box>
  );
};

const TranscriptHeader = ({
  transcript,
  open,
  onToggle,
}: {
  transcript: TranscriptSummary;
  open: boolean;
  onToggle: () => void;
}) => (
  <UnstyledButton
    className={board.button}
    aria-expanded={open}
    onClick={onToggle}
    w="100%"
    px={14}
    py={10}
  >
    <Group gap={8} wrap="nowrap" fz={13}>
      <TranscriptIcon size={13} />
      <Text span inherit fw={600}>
        {commitLabel(transcript)}
      </Text>
      <Text span inherit c={palette.muted} truncate>
        · {progressLabel(transcript)}
      </Text>
      <Box ml="auto" c={palette.muted} style={{ display: "flex" }}>
        <ChevronIcon up={open} />
      </Box>
    </Group>
  </UnstyledButton>
);

const TranscriptBody = ({
  session,
  transcript,
}: {
  session: SessionOverview;
  transcript: TranscriptSummary;
}) => {
  const { data, error } = useSessionTranscript(session, transcript);
  return data ? (
    <TranscriptChat links={NO_FILE_LINKS} transcript={data} />
  ) : (
    <TranscriptLoading error={error} />
  );
};

function useSessionTranscript(
  session: SessionOverview,
  transcript: TranscriptSummary,
) {
  const { name } = useRepository();
  const growing = !transcript.commit && session.status === "active";
  return useQuery(
    orpc.repositories.sessions.transcript.queryOptions({
      input: { name, id: session.id, transcript: transcript.id },
      refetchInterval: growing ? GROWING_REFRESH_MS : false,
    }),
  );
}

function commitLabel(transcript: TranscriptSummary): string {
  return transcript.commit
    ? `Commit ${shortSha(transcript.commit)}`
    : "Not committed yet";
}

function progressLabel(transcript: TranscriptSummary): string {
  const entries =
    transcript.entries === 1 ? "1 entry" : `${transcript.entries} entries`;
  const when = transcript.updatedAt
    ? `updated ${timeAgo(transcript.updatedAt)}`
    : `uploaded ${timeAgo(transcript.createdAt)}`;
  return `${entries} · ${when}`;
}
