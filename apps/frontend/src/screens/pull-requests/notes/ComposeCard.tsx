import { Button, Group, Menu, Text } from "@mantine/core";
import { useState } from "react";
import type { CommentKind, PullRequestDetail } from "@lib/contract";
import { palette, useFormContext } from "@lib/ds";
import { CheckIcon, ChevronIcon } from "../../../components/icons";
import type { Range } from "../diff/model";
import { linesText } from "../diff/notes";
import { useChatSelection } from "../chat/useChatSelection";
import { useDiscussion } from "../discussion";
import { CardFrame } from "./NotesCard";
import { NoteForm } from "./NoteForm";
import { LinesChip } from "./parts";

const KIND_ORDER: CommentKind[] = ["accept", "flag", "comment", "ask"];

// What each kind of comment does, as the menu and the hint say it. While an
// agent listens in the chat, an ask goes there instead of onto the lines.
function kindsFor(agent: string, chatting: boolean) {
  return {
    accept: {
      label: "Accept",
      hint: "Accepts the lines; a note goes with your review.",
    },
    flag: {
      label: "Flag",
      hint: "Asks for a change; goes with your review.",
    },
    comment: {
      label: "Comment",
      hint: "A note on the lines; goes with your review.",
    },
    ask: {
      label: "Ask",
      hint: chatting
        ? `A question, sent to ${agent} in the chat; it leaves no comment.`
        : `A question, sent to ${agent} right away.`,
    },
  } satisfies Record<CommentKind, { label: string; hint: string }>;
}

// A new comment on lines being written. An accept also accepts the lines.
export const ComposeCard = ({
  pr,
  path,
  range,
  onClose,
  onAcceptLines,
}: {
  pr: PullRequestDetail;
  path: string;
  range: Range;
  onClose: () => void;
  onAcceptLines?: (range: Range) => void;
}) => {
  const { create } = useDiscussion();
  const chat = useChatSelection(path, range);
  const [kind, setKind] = useState<CommentKind>("comment");
  const kinds = kindsFor(
    chat?.agent?.agent.name ?? pr.agent?.name ?? "the agent",
    !!chat?.ask,
  );
  const submit = async (body: string) => {
    if (kind === "ask" && chat?.ask) {
      await chat.ask(body);
    } else {
      await create({ kind, path, ...range, body });
    }
    if (kind === "accept") {
      onAcceptLines?.(range);
    }
    onClose();
  };
  return (
    <CardFrame>
      <Group
        gap={8}
        h={40}
        px={12}
        style={{ borderBottom: `1px solid ${palette.line}` }}
      >
        <Text span fz={12.5} fw={600}>
          New comment
        </Text>
        <LinesChip active>{linesText(range)}</LinesChip>
        <Text span fz={12} c={palette.muted}>
          drag down the lines or shift-click one to change the range
        </Text>
      </Group>
      <div style={{ padding: 12 }}>
        <NoteForm
          label="Comment"
          placeholder="What should the author know about these lines?"
          hint={kinds[kind].hint}
          onCancel={onClose}
          onSubmit={submit}
          submit={<KindButton kind={kind} kinds={kinds} onKind={setKind} />}
        />
      </div>
    </CardFrame>
  );
};

// Sends the comment as the chosen kind, spinning until it is sent; the arrow
// picks another.
const KindButton = ({
  kind,
  kinds,
  onKind,
}: {
  kind: CommentKind;
  kinds: ReturnType<typeof kindsFor>;
  onKind: (kind: CommentKind) => void;
}) => {
  const { submitting } = useFormContext();
  return (
    <Button.Group>
      <Button type="submit" size="compact-sm" loading={submitting}>
        {kinds[kind].label}
      </Button>
      <Menu position="bottom-end" width={300} shadow="md">
        <Menu.Target>
          <Button
            size="compact-sm"
            px={6}
            aria-label="Kind of comment"
            disabled={submitting}
          >
            <ChevronIcon />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {KIND_ORDER.map((k) => (
            <Menu.Item
              key={k}
              onClick={() => onKind(k)}
              leftSection={
                <span style={{ width: 12, color: palette.accent }}>
                  {k === kind && <CheckIcon size={12} />}
                </span>
              }
            >
              <Text fz={13} fw={600}>
                {kinds[k].label}
              </Text>
              <Text fz={12} c={palette.muted}>
                {kinds[k].hint}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  );
};
