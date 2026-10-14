import { Box, Button, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { Comment } from "@lib/contract";
import { palette } from "@lib/ds";
import { timeAgo } from "../../../logic/time";
import { linesText } from "../diff/notes";
import type { Range } from "../diff/model";
import { useDiscussion, type Thread } from "../discussion";
import { Markdown } from "../../../components/markdown/Markdown";
import { NoteForm } from "./NoteForm";
import { Action, KindBadge, LinesChip, shortSha, Who } from "./parts";

// A comment and its replies, with what you can do about it.
export const CommentThread = ({
  thread,
  around,
  onAcceptLines,
}: {
  thread: Thread;
  // The lines the card it sits in covers; a comment on other lines names
  // its own.
  around?: Range;
  // Accepts the comment's lines, when they are on screen.
  onAcceptLines?: (range: Range) => void;
}) => {
  const { root, replies } = thread;
  const [replying, setReplying] = useState(false);
  return (
    <Box
      p={12}
      bg={palette.panel}
      style={{ borderRadius: 8 }}
      aria-label={`Comment by ${root.author?.name ?? "someone"}`}
      role="article"
    >
      <Stack gap={8}>
        <CommentHeading comment={root} around={around} />
        <Body text={root.body} />
        <Replies replies={replies} />
        <Resolution comment={root} />
        {replying ? (
          <ReplyForm parent={root.id} onDone={() => setReplying(false)} />
        ) : (
          <ThreadActions
            comment={root}
            onReply={() => setReplying(true)}
            onAcceptLines={onAcceptLines}
          />
        )}
      </Stack>
    </Box>
  );
};

const CommentHeading = ({
  comment,
  around,
}: {
  comment: Comment;
  around?: Range;
}) => {
  const own = comment.start !== null && comment.end !== null;
  const differs =
    own &&
    (!around || around.start !== comment.start || around.end !== comment.end);
  return (
    <Group gap={8} wrap="wrap">
      <Who author={comment.author} mine={comment.mine} />
      <KindBadge comment={comment} />
      <Text span fz={12} c={palette.muted}>
        {timeAgo(comment.createdAt)}
      </Text>
      {differs && (
        <LinesChip>
          {linesText({ start: comment.start!, end: comment.end! })}
        </LinesChip>
      )}
      {comment.status === "draft" && (
        <Text span fz={12} c={palette.accent}>
          · goes out with your review
        </Text>
      )}
    </Group>
  );
};

const Body = ({ text }: { text: string }) => (
  <Text component="div" fz={13} c={palette.ink} style={{ textWrap: "pretty" }}>
    <Markdown>{text}</Markdown>
  </Text>
);

const Replies = ({ replies }: { replies: Comment[] }) => (
  <>
    {replies.map((reply) => (
      <Stack
        key={reply.id}
        gap={6}
        pl={12}
        ml={2}
        style={{ borderLeft: `2px solid ${palette.control}` }}
      >
        <Group gap={8}>
          <Who author={reply.author} mine={reply.mine} />
          <Text span fz={12} c={palette.muted}>
            {timeAgo(reply.createdAt)}
          </Text>
        </Group>
        <Body text={reply.body} />
      </Stack>
    ))}
  </>
);

const Resolution = ({ comment }: { comment: Comment }) =>
  comment.resolved && (
    <Text fz={12} c={palette.secondary}>
      ✓ Resolved by {comment.resolved.by?.name ?? "someone"} after{" "}
      <Text span ff="monospace" fz={11.5}>
        {shortSha(comment.resolved.commit)}
      </Text>
    </Text>
  );

const ThreadActions = ({
  comment,
  onReply,
  onAcceptLines,
}: {
  comment: Comment;
  onReply: () => void;
  onAcceptLines?: (range: Range) => void;
}) => (
  <Group gap={14}>
    {comment.status === "sent" && <Action onClick={onReply}>Reply</Action>}
    <FlagActions comment={comment} onAcceptLines={onAcceptLines} />
    <DraftActions comment={comment} />
  </Group>
);

// The person who set a flag resolves it, accepting its lines when they are
// on screen, or reopens it.
const FlagActions = ({
  comment,
  onAcceptLines,
}: {
  comment: Comment;
  onAcceptLines?: (range: Range) => void;
}) => {
  const { resolve } = useDiscussion();
  if (!comment.mine || comment.kind !== "flag" || comment.status !== "sent") {
    return null;
  }
  const resolveAndAccept = () => {
    resolve(comment.id, true);
    if (comment.start !== null && comment.end !== null) {
      onAcceptLines?.({ start: comment.start, end: comment.end });
    }
  };
  return comment.resolved ? (
    <Action onClick={() => resolve(comment.id, false)}>Reopen</Action>
  ) : (
    <Action color={palette.flagInk} onClick={resolveAndAccept}>
      {onAcceptLines ? "Resolve and accept these lines" : "Resolve"}
    </Action>
  );
};

const DraftActions = ({ comment }: { comment: Comment }) => {
  const { send, remove } = useDiscussion();
  if (!comment.mine || comment.status !== "draft") {
    return null;
  }
  return (
    <>
      <Action onClick={() => send(comment.id)}>Send now</Action>
      <Action color={palette.secondary} onClick={() => remove(comment.id)}>
        Delete
      </Action>
    </>
  );
};

const ReplyForm = ({
  parent,
  onDone,
}: {
  parent: string;
  onDone: () => void;
}) => {
  const { reply } = useDiscussion();
  return (
    <NoteForm
      label="Reply"
      placeholder="Reply"
      onCancel={onDone}
      onSubmit={async (body) => {
        await reply(parent, body);
        onDone();
      }}
      submit={
        <Button type="submit" size="compact-sm">
          Reply
        </Button>
      }
    />
  );
};
