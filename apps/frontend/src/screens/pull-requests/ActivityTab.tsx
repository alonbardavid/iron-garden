import {
  Anchor,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  Comment,
  PullRequestCommit,
  PullRequestDetail,
  ReviewSession,
} from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../components/board.module.css";
import {
  ChevronIcon,
  CommitIcon,
  FlagIcon,
  TranscriptIcon,
} from "../../components/icons";
import { timeAgo } from "../../logic/time";
import { commitPath } from "../repository/code/paths";
import { linesText } from "./diff/notes";
import { useDiscussion, type Thread } from "./discussion";
import { FileLink, NoteMarkdown } from "./notes/FileLinks";
import { AgentTag, Avatar, Pill, shortSha } from "./notes/parts";
import { pullRequestPath } from "./paths";
import {
  Committed,
  TranscriptChat,
  TranscriptLoading,
  useTranscript,
} from "./notes/Transcript";
import { SkeletonCards } from "../../components/skeletons";

type Item =
  | { kind: "commit"; at: number; commit: PullRequestCommit }
  | { kind: "review"; at: number; review: ReviewSession }
  | { kind: "comment"; at: number; thread: Thread };

// What happened on the pull request, oldest first: its commits with the
// transcripts of how they were made, the reviews people sent, and the
// comments that went to the agent.
export const ActivityTab = ({ pr }: { pr: PullRequestDetail }) => {
  const { activity, threads } = useDiscussion();
  const items = timeline(
    activity?.commits ?? [],
    activity?.reviews ?? [],
    threads,
  );
  return (
    <Stack gap={12} maw={920} mx="auto" pos="relative">
      <Box
        aria-hidden
        pos="absolute"
        top={14}
        bottom={0}
        left={13}
        w={2}
        bg={palette.rule}
      />
      <Opened pr={pr} />
      {items.map((item) => (
        <TimelineItem key={itemKey(item)} pr={pr} item={item} />
      ))}
      {!activity && <SkeletonCards count={2} />}
    </Stack>
  );
};

const TimelineItem = ({ pr, item }: { pr: PullRequestDetail; item: Item }) => {
  switch (item.kind) {
    case "commit":
      return <CommitItem pr={pr} commit={item.commit} />;
    case "review":
      return <ReviewItem pr={pr} review={item.review} />;
    case "comment":
      return <CommentItem pr={pr} thread={item.thread} />;
  }
};

const Opened = ({ pr }: { pr: PullRequestDetail }) => (
  <Group gap={14} wrap="nowrap" fz={13} c={palette.secondary}>
    <Marker>
      <Avatar name={pr.agent?.name ?? "?"} />
    </Marker>
    <Text span inherit fw={600} c={palette.ink}>
      {pr.agent?.name ?? "Someone"}
    </Text>
    {pr.agent && <AgentTag />}
    <span>
      opened this pull request
      {pr.agent?.ownerName ? ` for ${pr.agent.ownerName}` : ""} ·{" "}
      {timeAgo(pr.createdAt)}
    </span>
  </Group>
);

// The circle on the timeline beside an item.
const Marker = ({ children }: { children: ReactNode }) => (
  <Box
    w={28}
    h={28}
    pos="relative"
    bg={palette.surface}
    c={palette.secondary}
    style={{
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      boxShadow: `inset 0 0 0 1px ${palette.control}`,
    }}
  >
    {children}
  </Box>
);

const Card = ({ children }: { children: ReactNode }) => (
  <Paper
    withBorder
    style={{
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      borderColor: palette.card,
    }}
  >
    {children}
  </Paper>
);

const CommitItem = ({
  pr,
  commit,
}: {
  pr: PullRequestDetail;
  commit: PullRequestCommit;
}) => {
  const { ref, open, setOpen } = useLinkedCommit(commit.sha);
  return (
    <Group ref={ref} gap={14} align="flex-start" wrap="nowrap">
      <Marker>
        <CommitIcon />
      </Marker>
      <Card>
        <CommitRow
          repository={pr.repository}
          commit={commit}
          open={open}
          onToggle={() => setOpen(!open)}
        />
        {open && commit.transcript && (
          <CommitTranscript pr={pr} commit={commit} />
        )}
      </Card>
    </Group>
  );
};

// A commit the link names (?commit=) opens its transcript and scrolls into
// view.
function useLinkedCommit(sha: string) {
  const [params] = useSearchParams();
  const linked = params.get("commit") === sha;
  const [open, setOpen] = useState(linked);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (linked) {
      ref.current?.scrollIntoView({ block: "start" });
    }
  }, [linked]);
  return { ref, open, setOpen };
}

const CommitRow = ({
  repository,
  commit,
  open,
  onToggle,
}: {
  repository: string;
  commit: PullRequestCommit;
  open: boolean;
  onToggle: () => void;
}) => (
  <Group gap={10} mih={44} px={14} py={6} wrap="nowrap">
    <Anchor
      component={Link}
      to={commitPath(repository, commit.sha)}
      aria-label={`View commit ${shortSha(commit.sha)}`}
      ff="monospace"
      fz={12.5}
      c={palette.accent}
      underline="hover"
    >
      {shortSha(commit.sha)}
    </Anchor>
    <Text span fz={13} fw={500} truncate>
      {commit.title}
    </Text>
    <Text span fz={12} c={palette.muted} ml="auto" style={{ flexShrink: 0 }}>
      {timeAgo(commit.committedAt)}
    </Text>
    {commit.transcript && (
      <TranscriptToggle
        entries={commit.transcript.entries}
        open={open}
        onClick={onToggle}
      />
    )}
  </Group>
);

const TranscriptToggle = ({
  entries,
  open,
  onClick,
}: {
  entries: number;
  open: boolean;
  onClick: () => void;
}) => (
  <UnstyledButton
    className={board.button}
    aria-expanded={open}
    onClick={onClick}
    h={26}
    px={10}
    fz={12}
    fw={600}
    c={palette.accentInk}
    style={{
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 6,
      borderRadius: 13,
      border: `1px solid ${palette.accentRing}`,
      background: palette.surface,
    }}
  >
    <TranscriptIcon size={12} />
    Transcript · {entries} {entries === 1 ? "entry" : "entries"}
    <ChevronIcon up={open} />
  </UnstyledButton>
);

// A commit's transcript as a conversation.
const CommitTranscript = ({
  pr,
  commit,
}: {
  pr: PullRequestDetail;
  commit: PullRequestCommit;
}) => {
  const summary = commit.transcript!;
  const { data, error } = useTranscript(pr, summary.id);
  return (
    <>
      <Group
        gap={8}
        px={14}
        h={32}
        fz={12}
        c={palette.muted}
        bg={palette.panel}
        style={{ borderTop: `1px solid ${palette.line}` }}
      >
        <Text span fz={12} fw={600} c={palette.ink}>
          {pr.agent?.name ?? "The agent"}
        </Text>
        <AgentTag />
        <span>· transcript ·</span>
        <span>
          {summary.source === "api"
            ? `Uploaded through the API ${timeAgo(summary.createdAt)}`
            : "Attached by the commit trailer"}
        </span>
      </Group>
      <Box px={16} py={14} style={{ borderTop: `1px solid ${palette.line}` }}>
        {data ? (
          <TranscriptChat
            pr={pr}
            transcript={data}
            ending={
              <Committed
                sha={commit.sha}
                title={commit.title}
                trailer={trailerOf(commit.message)}
              />
            }
          />
        ) : (
          <TranscriptLoading error={error} />
        )}
      </Box>
    </>
  );
};

function trailerOf(message: string): string | null {
  return /^Agent-Transcript:.*$/im.exec(message)?.[0] ?? null;
}

const VERDICT_PILLS = {
  accept: {
    label: "Accepted",
    bg: palette.successSoft,
    color: palette.successInk,
  },
  changes: {
    label: "Requested changes",
    bg: palette.dangerSoft,
    color: palette.dangerInk,
  },
} as const;

const ReviewItem = ({
  pr,
  review,
}: {
  pr: PullRequestDetail;
  review: ReviewSession;
}) => {
  const { comments } = useDiscussion();
  const pill = VERDICT_PILLS[review.verdict];
  return (
    <Group gap={14} align="flex-start" wrap="nowrap">
      <Marker>
        <Avatar name={review.author?.name ?? "?"} />
      </Marker>
      <Card>
        <Stack gap={6} px={14} py={12}>
          <Group gap={8}>
            <Text span fz={13} fw={600}>
              {review.author?.name ?? "Someone"}
            </Text>
            <Pill bg={pill.bg} color={pill.color}>
              {pill.label}
            </Pill>
            <Text span fz={12} c={palette.muted} ml="auto">
              {timeAgo(review.createdAt)}
            </Text>
          </Group>
          <Text fz={12.5} c={palette.muted}>
            {reviewSummary(review, comments ?? [])}
          </Text>
          {review.body && (
            <Text component="div" fz={13}>
              <NoteMarkdown pr={pr}>{review.body}</NoteMarkdown>
            </Text>
          )}
        </Stack>
      </Card>
    </Group>
  );
};

const CommentItem = ({
  pr,
  thread,
}: {
  pr: PullRequestDetail;
  thread: Thread;
}) => {
  const { root, replies } = thread;
  return (
    <Group gap={14} align="flex-start" wrap="nowrap">
      <Marker>
        <CommentMarker root={root} />
      </Marker>
      <Card>
        <Stack gap={8} px={14} py={12}>
          <Group gap={6} fz={13} c={palette.secondary} wrap="nowrap">
            <Text span inherit fw={600} c={palette.ink}>
              {root.author?.name ?? "Someone"}
              {root.mine && root.author?.kind === "user" ? " (you)" : ""}
            </Text>
            <Text span inherit truncate>
              <EventText pr={pr} root={root} />
            </Text>
            <Text
              span
              fz={12}
              c={palette.muted}
              ml="auto"
              style={{ flexShrink: 0 }}
            >
              {timeAgo(root.sentAt ?? root.createdAt)}
            </Text>
          </Group>
          <Text
            component="div"
            fz={13}
            pl={12}
            style={{ borderLeft: `2px solid ${palette.control}` }}
          >
            <NoteMarkdown pr={pr}>{root.body}</NoteMarkdown>
          </Text>
          <ActivityReplies pr={pr} replies={replies} />
        </Stack>
      </Card>
    </Group>
  );
};

const CommentMarker = ({ root }: { root: Comment }) =>
  root.kind === "flag" ? (
    <Text span c={palette.flag} display="flex">
      <FlagIcon />
    </Text>
  ) : (
    <Avatar name={root.author?.name ?? "?"} />
  );

const ActivityReplies = ({
  pr,
  replies,
}: {
  pr: PullRequestDetail;
  replies: Comment[];
}) => (
  <>
    {replies.map((reply) => (
      <Stack key={reply.id} gap={4}>
        <Group gap={6} fz={12} c={palette.muted}>
          <Avatar name={reply.author?.name ?? "?"} />
          <Text span fz={12.5} fw={600} c={palette.ink}>
            {reply.author?.name ?? "Someone"}
          </Text>
          {reply.author?.kind === "agent" && <AgentTag />}
          <span>replied · {timeAgo(reply.createdAt)}</span>
        </Group>
        <Text component="div" fz={13} pl={28}>
          <NoteMarkdown pr={pr}>{reply.body}</NoteMarkdown>
        </Text>
      </Stack>
    ))}
  </>
);

function timeline(
  commits: PullRequestCommit[],
  reviews: ReviewSession[],
  threads: Thread[],
): Item[] {
  return [
    ...commits.map((commit) => ({
      kind: "commit" as const,
      at: commit.committedAt,
      commit,
    })),
    ...reviews.map((review) => ({
      kind: "review" as const,
      at: review.createdAt,
      review,
    })),
    ...threads
      .filter(({ root }) => root.status === "sent" && isEvent(root))
      .map((thread) => ({
        kind: "comment" as const,
        at: thread.root.sentAt ?? thread.root.createdAt,
        thread,
      })),
  ].sort((a, b) => a.at - b.at);
}

// Flags and questions go to the agent on their own, and an agent's comments
// come from it; other comments go out within a review.
const isEvent = (root: Thread["root"]) =>
  root.kind === "flag" || root.kind === "ask" || root.author?.kind === "agent";

const itemKey = (item: Item) =>
  item.kind === "commit"
    ? item.commit.sha
    : item.kind === "review"
      ? item.review.id
      : item.thread.root.id;

const VERBS = {
  flag: "flagged",
  ask: "asked about",
  comment: "commented on",
  accept: "accepted",
};

// "flagged src/a.ts line 4 and sent it to the-agent", the file a link to
// its diff.
const EventText = ({ pr, root }: { pr: PullRequestDetail; root: Comment }) => (
  <>
    {VERBS[root.kind ?? "comment"]}{" "}
    {root.path && root.start !== null && root.end !== null ? (
      <>
        <FileLink to={pullRequestPath(pr, "files", { file: root.path })}>
          {root.path}
        </FileLink>{" "}
        {linesText({ start: root.start, end: root.end })}
      </>
    ) : (
      "the pull request"
    )}
    {root.author?.kind === "user" && !root.review && pr.agent
      ? ` and sent it to ${pr.agent.name}`
      : ""}
  </>
);

// "Review session · accepted 188 of 508 changes · 1 flag · 1 comment".
function reviewSummary(review: ReviewSession, comments: Comment[]): string {
  const sent = comments.filter((c) => c.review === review.id);
  const flags = sent.filter((c) => c.kind === "flag").length;
  const notes = sent.length - flags;
  return [
    `Review session · accepted ${review.accepted} of ${review.total} changes`,
    ...(flags > 0 ? [flags === 1 ? "1 flag" : `${flags} flags`] : []),
    ...(notes > 0 ? [notes === 1 ? "1 comment" : `${notes} comments`] : []),
  ].join(" · ");
}
