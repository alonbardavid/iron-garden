import { Group } from "@mantine/core";
import type { PullRequestSummary } from "@lib/contract";
import { palette } from "@lib/ds";

type PullRequestStatus = PullRequestSummary["status"];

// A processing pull request is open while its agent brackets it.
export const StatusPill = ({ status }: { status: PullRequestStatus }) => {
  const pill = PILLS[status === "processing" ? "open" : status];
  return (
    <Group
      gap={6}
      h={24}
      px={10}
      fz={12}
      fw={600}
      wrap="nowrap"
      bg={pill.bg}
      c={pill.color}
      style={{ borderRadius: 12, flexShrink: 0, whiteSpace: "nowrap" }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: pill.dot,
          flexShrink: 0,
        }}
      />
      {pill.label}
    </Group>
  );
};

const PILLS = {
  open: {
    label: "Open",
    bg: palette.successSoft,
    color: palette.successInk,
    dot: palette.added,
  },
  merged: {
    label: "Merged",
    bg: palette.accentSoft,
    color: palette.accentInk,
    dot: palette.accent,
  },
  closed: {
    label: "Closed",
    bg: palette.hover,
    color: palette.secondary,
    dot: palette.faint,
  },
} as const;
