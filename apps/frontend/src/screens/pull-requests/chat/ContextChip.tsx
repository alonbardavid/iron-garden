import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ChatContext } from "@lib/contract";
import { palette } from "@lib/ds";
import { useChat } from "./ChatProvider";
import { contextLabel } from "./model";

// What a message is about, as a chip; a link back to it when `to` is set.
export const ContextChip = ({
  context,
  title,
  to,
  children,
}: {
  context: ChatContext;
  title: string;
  to?: string;
  children?: ReactNode;
}) => (
  <Chip label={useContextLabel(context)} title={title} to={to}>
    {children}
  </Chip>
);

// A small label in the chat, such as what a message sends along.
export const Chip = ({
  label,
  title,
  to,
  children,
}: {
  label: string;
  title: string;
  to?: string;
  children?: ReactNode;
}) => (
  <Text
    span
    title={title}
    h={20}
    px={7}
    fz={11}
    fw={500}
    c={palette.accentInk}
    bg={palette.accentTint}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      flex: "0 1 auto",
      minWidth: 0,
      maxWidth: 260,
      borderRadius: 10,
      whiteSpace: "nowrap",
    }}
  >
    <Text span inherit truncate>
      {to ? (
        <Link to={to} style={{ color: "inherit" }}>
          {label}
        </Link>
      ) : (
        label
      )}
    </Text>
    {children}
  </Text>
);

function useContextLabel(context: ChatContext): string {
  const groups = useChat()?.pr.groups;
  return contextLabel(context, (id) => groups?.find((g) => g.id === id)?.title);
}
