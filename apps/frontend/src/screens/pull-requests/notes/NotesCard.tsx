import { Box, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { palette } from "@lib/ds";
import { CloseIcon, CommentIcon } from "../../../components/icons";
import { IconButton } from "../diff/controls";
import type { Range } from "../diff/model";
import { linesText } from "../diff/notes";
import type { Thread } from "../discussion";
import { CommentThread } from "./CommentThread";

// The comments on a range of lines, in one card under them.
export const NotesCard = ({
  range,
  threads,
  onClose,
  onAcceptLines,
}: {
  range: Range;
  threads: Thread[];
  onClose: () => void;
  onAcceptLines?: (range: Range) => void;
}) => (
  <CardFrame>
    <Group
      gap={6}
      h={40}
      px={12}
      style={{ borderBottom: `1px solid ${palette.line}` }}
    >
      <Group gap={6} fz={12.5} fw={600} c={palette.ink}>
        <CommentIcon />
        {threads.length === 1 ? "Comment" : `${threads.length} comments`}
      </Group>
      <Text fz={12} c={palette.muted} ml="auto">
        {linesText(range)}
      </Text>
      <IconButton label="Close" onClick={onClose}>
        <CloseIcon />
      </IconButton>
    </Group>
    <Stack gap={8} p={10}>
      {threads.map((thread) => (
        <CommentThread
          key={thread.root.id}
          thread={thread}
          around={range}
          onAcceptLines={onAcceptLines}
        />
      ))}
    </Stack>
  </CardFrame>
);

// Sets a card off from the code above and below it, joined to its lines by
// the bar in the note column.
export const CardFrame = ({ children }: { children: ReactNode }) => (
  <Box
    py={8}
    pr={16}
    pl={56}
    bg={palette.panel}
    style={{
      fontFamily: "var(--mantine-font-family)",
      fontSize: 13,
      lineHeight: 1.45,
      borderTop: `1px solid ${palette.line}`,
      borderBottom: `1px solid ${palette.line}`,
    }}
  >
    <Box
      maw={760}
      bg={palette.surface}
      style={{
        border: `1px solid ${palette.card}`,
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(22, 25, 29, 0.05)",
      }}
    >
      {children}
    </Box>
  </Box>
);
