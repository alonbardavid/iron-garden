import { Group, Text, UnstyledButton } from "@mantine/core";
import type { ReactNode } from "react";
import type { Comment, CommentAuthor, CommentKind } from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../../components/board.module.css";

// The badge beside a person's or an agent's name.
export const Avatar = ({ name }: { name: string }) => (
  <span
    aria-hidden
    style={{
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 22,
      height: 22,
      borderRadius: 5,
      background: palette.accentSoft,
      color: palette.accentInk,
      fontSize: 10,
      fontWeight: 600,
    }}
  >
    {initials(name)}
  </span>
);

export const AgentTag = () => (
  <Text
    span
    px={5}
    fz={11}
    fw={500}
    lh="16px"
    c={palette.secondary}
    bg={palette.hover}
    style={{ borderRadius: 4 }}
  >
    agent
  </Text>
);

// A comment's author as a name, "(you)" when it is you, and the agent tag.
export const Who = ({
  author,
  mine,
}: {
  author: CommentAuthor | null;
  mine: boolean;
}) => (
  <Group gap={6} wrap="nowrap">
    <Avatar name={author?.name ?? "?"} />
    <Text span fz={12.5} fw={600} c={palette.ink}>
      {author?.name ?? "Someone"}
      {mine && author?.kind === "user" ? " (you)" : ""}
    </Text>
    {author?.kind === "agent" && <AgentTag />}
  </Group>
);

const KINDS: Record<
  CommentKind,
  { label: string; bg: string; color: string } | null
> = {
  comment: null,
  flag: { label: "Flag", bg: palette.flagSoft, color: palette.flagInk },
  accept: {
    label: "Accepted",
    bg: palette.successSoft,
    color: palette.successInk,
  },
  ask: { label: "Question", bg: palette.accentSoft, color: palette.accentInk },
};

export const KindBadge = ({ comment }: { comment: Comment }) => {
  const kind = comment.resolved
    ? { label: "Resolved", bg: palette.chip, color: palette.secondary }
    : comment.kind && KINDS[comment.kind];
  if (!kind) {
    return null;
  }
  return (
    <Pill bg={kind.bg} color={kind.color}>
      {kind.label}
    </Pill>
  );
};

export const Pill = ({
  bg,
  color,
  children,
}: {
  bg: string;
  color: string;
  children: ReactNode;
}) => (
  <Text
    span
    px={6}
    fz={11}
    fw={600}
    lh="18px"
    c={color}
    bg={bg}
    style={{ borderRadius: 4, whiteSpace: "nowrap" }}
  >
    {children}
  </Text>
);

// A small text button in a card's row of actions.
export const Action = ({
  onClick,
  color = palette.accent,
  children,
}: {
  onClick: () => void;
  color?: string;
  children: ReactNode;
}) => (
  <UnstyledButton
    className={board.ghost}
    onClick={onClick}
    h={22}
    px={6}
    ml={-6}
    fz={12}
    fw={500}
    c={color}
    style={{ borderRadius: 5 }}
  >
    {children}
  </UnstyledButton>
);

// A line chip: "line 20", or a path and lines.
export const LinesChip = ({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) => (
  <Text
    span
    ff="monospace"
    px={6}
    fz={11}
    lh="18px"
    c={active ? palette.accentInk : palette.secondary}
    bg={active ? palette.accentSoft : palette.chip}
    style={{
      borderRadius: 4,
      whiteSpace: "nowrap",
      border: active ? `1px solid ${palette.accent}` : "1px solid transparent",
    }}
  >
    {children}
  </Text>
);

export const shortSha = (sha: string) => sha.slice(0, 7);

export function initials(name: string): string {
  const words = name.split(/[\s._-]+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}
