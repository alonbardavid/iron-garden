import { Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  PullRequestDetail,
  Transcript,
  TranscriptEntry,
} from "@lib/contract";
import { palette } from "@lib/ds";
import { CommitIcon } from "../../../components/icons";
import { orpc } from "../../../logic/api/orpc";
import { FileLink, fileLinksOf, LinkedText, NoteMarkdown } from "./FileLinks";
import { shortSha } from "./parts";
import { SkeletonChat } from "../../../components/skeletons";

// A transcript as a conversation: prompts on the right, what the agent said
// and did on the left, and the commit it ended in. The files it names link
// to the pull request's.
export const TranscriptChat = ({
  pr,
  transcript,
  ending,
}: {
  pr: PullRequestDetail;
  transcript: Transcript;
  ending?: ReactNode;
}) => (
  <Stack gap={14}>
    {transcript.entries.map((entry, i) => (
      <ChatEntry key={i} pr={pr} entry={entry} />
    ))}
    {ending}
  </Stack>
);

// The end of a commit's transcript: the commit, and the trailer that named
// the transcript when one did.
export const Committed = ({
  sha,
  title,
  trailer,
}: {
  sha: string;
  title: string;
  trailer: string | null;
}) => (
  <Stack gap={2} align="center" py={6}>
    <Group gap={6} c={palette.muted} fz={12}>
      <CommitIcon size={12} />
      <span>Committed</span>
      <Text span ff="monospace" fz={12} c={palette.ink}>
        {shortSha(sha)} · {title}
      </Text>
    </Group>
    {trailer && (
      <Text ff="monospace" fz={11.5} c={palette.muted}>
        {trailer}
      </Text>
    )}
  </Stack>
);

export const TranscriptLoading = ({ error }: { error: Error | null }) =>
  error ? (
    <Text fz={12.5} c={palette.removed}>
      {error.message}
    </Text>
  ) : (
    <SkeletonChat />
  );

const ChatEntry = ({
  pr,
  entry,
}: {
  pr: PullRequestDetail;
  entry: TranscriptEntry;
}) =>
  entry.role === "user" ? (
    <Stack gap={4} align="flex-end">
      <Text fz={11.5} c={palette.muted}>
        {entry.author ?? "Prompt"}
      </Text>
      <Text
        component="div"
        fz={13}
        c={palette.ink}
        bg={palette.accentSoft}
        px={12}
        py={8}
        maw="80%"
        style={{ borderRadius: 10, whiteSpace: "pre-wrap" }}
      >
        <LinkedText pr={pr}>{entry.text}</LinkedText>
      </Text>
    </Stack>
  ) : (
    <Stack gap={6}>
      {entry.text && (
        <Text component="div" fz={13} c={palette.ink}>
          <NoteMarkdown pr={pr}>{entry.text}</NoteMarkdown>
        </Text>
      )}
      <ToolChips pr={pr} tools={entry.tools ?? []} />
    </Stack>
  );

const ToolChips = ({
  pr,
  tools,
}: {
  pr: PullRequestDetail;
  tools: { name: string; target: string }[];
}) =>
  tools.length > 0 && (
    <Group gap={6}>
      {tools.map((tool, i) => (
        <Text
          key={i}
          span
          ff="monospace"
          fz={11.5}
          px={8}
          lh="22px"
          bg={palette.well}
          c={palette.ink}
          style={{ borderRadius: 4 }}
        >
          <Text span inherit c={palette.muted}>
            {tool.name}
          </Text>{" "}
          <ToolTarget pr={pr} target={tool.target} />
        </Text>
      ))}
    </Group>
  );

// What a tool ran on, a link when it is a file.
const ToolTarget = ({
  pr,
  target,
}: {
  pr: PullRequestDetail;
  target: string;
}) => {
  const href = fileLinksOf(pr).hrefOf(target);
  return href ? <FileLink to={href}>{target}</FileLink> : target;
};

export function useTranscript(
  pr: PullRequestDetail,
  transcript: string,
  enabled = true,
) {
  return useQuery(
    orpc.pullRequests.activity.transcript.queryOptions({
      input: { name: pr.repository, number: pr.number, transcript },
      enabled,
      staleTime: Infinity,
    }),
  );
}
