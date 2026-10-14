import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { palette } from "@lib/ds";

// Placeholders shaped like what is loading, so a screen keeps its layout
// while it waits. Each announces itself once to assistive tech.

export const Loading = ({ children }: { children: ReactNode }) => (
  <Box role="status" aria-label="Loading" aria-busy="true">
    {children}
  </Box>
);

// Lines of text; the last one shorter, as a paragraph ends.
export const SkeletonText = ({
  lines = 3,
  height = 10,
}: {
  lines?: number;
  height?: number;
}) => (
  <Stack gap={10}>
    {range(lines).map((i) => (
      <Skeleton
        key={i}
        height={height}
        width={lines > 1 && i === lines - 1 ? "60%" : "100%"}
        radius="sm"
      />
    ))}
  </Stack>
);

// A card of a settings or account page: a title over a few lines.
export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => (
  <Paper withBorder radius="md" p={18}>
    <Stack gap={16}>
      <Skeleton height={14} width="30%" radius="sm" />
      <SkeletonText lines={lines} />
    </Stack>
  </Paper>
);

// Cards stacked as a page lays them out.
export const SkeletonCards = ({ count = 2 }: { count?: number }) => (
  <Loading>
    <Stack gap={16}>
      {range(count).map((i) => (
        <SkeletonCard key={i} lines={i === 0 ? 3 : 2} />
      ))}
    </Stack>
  </Loading>
);

// The rows of a list or table: a title, a line under it, and a badge.
export const SkeletonRows = ({
  rows = 5,
  meta = true,
  badge = true,
}: {
  rows?: number;
  meta?: boolean;
  badge?: boolean;
}) => (
  <Loading>
    {range(rows).map((i) => (
      <SkeletonRow key={i} index={i} meta={meta} badge={badge} />
    ))}
  </Loading>
);

// The same rows in a bordered panel, for a list that has none of its own yet.
export const SkeletonList = (props: Parameters<typeof SkeletonRows>[0]) => (
  <Paper withBorder radius="md">
    <SkeletonRows {...props} />
  </Paper>
);

// Lines of code, ragged and indented like real code.
export const SkeletonCode = ({ lines = 14 }: { lines?: number }) => (
  <Loading>
    <Stack gap={11} py={14} px={16}>
      {range(lines).map((i) => (
        <Group key={i} gap={16} wrap="nowrap">
          <Skeleton height={9} width={18} radius="sm" />
          <Skeleton
            height={9}
            ml={(i % 4) * 14}
            width={i % 5 === 4 ? "8%" : ragged(i, 18, 62)}
            radius="sm"
          />
        </Group>
      ))}
    </Stack>
  </Loading>
);

// The rows of a file tree, stepped in at depth.
export const SkeletonTree = ({
  rows = 7,
  depth = 0,
}: {
  rows?: number;
  depth?: number;
}) => (
  <Loading>
    {range(rows).map((i) => (
      <Group key={i} h={30} gap={8} pl={8 + depth * 16 + 4} wrap="nowrap">
        <Skeleton height={12} width={12} radius="sm" />
        <Skeleton height={9} width={ragged(i, 30, 60)} radius="sm" />
      </Group>
    ))}
  </Loading>
);

// The messages of a conversation, from either side.
export const SkeletonChat = ({ messages = 3 }: { messages?: number }) => (
  <Loading>
    <Stack gap={12} p={4}>
      {range(messages).map((i) => (
        <Skeleton
          key={i}
          height={i % 2 ? 36 : 52}
          width={ragged(i, 45, 75)}
          ml={i % 2 ? "auto" : 0}
          radius="md"
        />
      ))}
    </Stack>
  </Loading>
);

const SkeletonRow = ({
  index,
  meta,
  badge,
}: {
  index: number;
  meta: boolean;
  badge: boolean;
}) => (
  <Group
    px={16}
    py={meta ? 16 : 13}
    gap={24}
    justify="space-between"
    wrap="nowrap"
    style={{ borderTop: index ? `1px solid ${palette.line}` : undefined }}
  >
    <Stack gap={8} style={{ flex: 1 }}>
      <Skeleton height={12} width={ragged(index, 30, 55)} radius="sm" />
      {meta && (
        <Skeleton height={9} width={ragged(index + 3, 15, 30)} radius="sm" />
      )}
    </Stack>
    {badge && <Skeleton height={20} width={72} radius="xl" />}
  </Group>
);

// A width for row i that varies from row to row, between min and max percent.
const ragged = (i: number, min: number, max: number) =>
  `${min + ((i * 37) % (max - min + 1))}%`;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
