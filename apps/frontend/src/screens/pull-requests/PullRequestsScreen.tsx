import {
  Badge,
  Group,
  Loader,
  NavLink,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { PullRequestCounts, PullRequestSummary } from "@lib/contract";
import { palette } from "@lib/ds";
import { Page } from "../../components/Page";
import { ShowMore } from "../../components/ShowMore";
import { SkeletonRows } from "../../components/skeletons";
import { orpc } from "../../logic/api/orpc";
import { nextPage, usePagedList } from "../../logic/api/paging";
import { timeAgo } from "../../logic/time";
import { withQuery } from "../../logic/url";
import { useRepository } from "../repository/RepositoryLayout";
import { AuthorLine } from "./AuthorLine";
import { Markdown } from "../../components/markdown/Markdown";
import { pullRequestPath } from "./paths";
import { Bar } from "./ProgressBar";
import { ImportPullRequestButton } from "./ImportPullRequest";

// The server's status filters; "open" keeps those still processing too.
const FILTERS = [
  { key: "open", label: "Open" },
  { key: "processing", label: "Processing" },
  { key: "merged", label: "Merged" },
  { key: "closed", label: "Closed" },
] as const satisfies readonly {
  key: keyof PullRequestCounts;
  label: string;
}[];

type Filter = (typeof FILTERS)[number];

export const PullRequestsScreen = () => {
  const { name } = useRepository();
  const [search] = useSearchParams();
  const { data: counts } = useQuery(
    orpc.pullRequests.counts.queryOptions({ input: { name } }),
  );
  const current =
    FILTERS.find((f) => f.key === search.get("status")) ?? FILTERS[0];
  return (
    <Page
      title="Pull requests"
      action={<ImportPullRequestButton name={name} />}
    >
      <Group align="start" gap={20} wrap="nowrap">
        <StatusFilters current={current} counts={counts} />
        <Paper withBorder radius="md" style={{ flex: 1, overflow: "hidden" }}>
          <PullRequestList name={name} status={current.key} />
        </Paper>
      </Group>
    </Page>
  );
};

const StatusFilters = ({
  current,
  counts,
}: {
  current: Filter;
  counts: PullRequestCounts | undefined;
}) => {
  const { pathname } = useLocation();
  return (
    <Paper withBorder radius="md" p={6} w={240} style={{ flexShrink: 0 }}>
      <Text size="xs" fw={600} c="dimmed" px={8} pt={10} pb={4}>
        Status
      </Text>
      {FILTERS.map((f) => (
        <NavLink
          key={f.key}
          label={f.label}
          component={Link}
          to={withQuery(pathname, {
            status: f.key === "open" ? null : f.key,
          })}
          active={f === current}
          rightSection={<Text size="xs">{counts?.[f.key]}</Text>}
          style={{ borderRadius: 6 }}
        />
      ))}
    </Paper>
  );
};

// The pull requests one status filter keeps, newest first, a page at a time.
const PullRequestList = ({
  name,
  status,
}: {
  name: string;
  status: Filter["key"];
}) => {
  const list = usePagedList(
    orpc.pullRequests.list.infiniteOptions({
      input: (cursor) => ({ name, status, cursor }),
      ...nextPage,
    }),
  );
  if (!list.items) {
    return <SkeletonRows rows={4} />;
  }
  return list.items.length === 0 ? (
    <Stack align="center" py={48} gap={4}>
      <Text fw={600}>Nothing here</Text>
      <Text size="sm" c="dimmed">
        Agents open pull requests from their sessions.
      </Text>
    </Stack>
  ) : (
    <>
      <PullRequestTable pullRequests={list.items} />
      <ShowMore list={list} />
    </>
  );
};

const PullRequestTable = ({
  pullRequests,
}: {
  pullRequests: PullRequestSummary[];
}) => (
  <Table
    verticalSpacing={12}
    horizontalSpacing={16}
    striped="even"
    stripedColor={palette.subtle}
    highlightOnHover
    highlightOnHoverColor={palette.tint}
  >
    <Table.Thead>
      <Table.Tr>
        <Table.Th>Pull request</Table.Th>
        <Table.Th>Waiting on</Table.Th>
        <Table.Th>Review</Table.Th>
        <Table.Th>Size</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {pullRequests.map((pr) => (
        <Table.Tr key={pr.id}>
          <Table.Td>
            <Text component={Link} to={pullRequestPath(pr)} fw={600}>
              <Markdown inline>{pr.title}</Markdown>
            </Text>
            <Group gap={6} mt={2}>
              <Text size="sm" c="dimmed" ff="monospace">
                #{pr.number}
              </Text>
              <AuthorLine pr={pr} />
              <Text size="sm" c="dimmed">
                · opened {timeAgo(pr.createdAt)}
              </Text>
            </Group>
          </Table.Td>
          <Table.Td>
            <WaitingOn pr={pr} />
          </Table.Td>
          <Table.Td w={170}>
            <ReviewProgress pr={pr} />
          </Table.Td>
          <Table.Td>
            <Text size="sm">
              {pr.fileCount} files · {pr.groupCount} brackets
            </Text>
          </Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);

const WaitingOn = ({ pr }: { pr: PullRequestSummary }) => {
  if (pr.status === "processing") {
    return (
      <Badge
        variant="light"
        styles={{
          root: { background: palette.warningSoft, color: palette.warningInk },
        }}
        leftSection={<Loader size={10} color={palette.warningInk} />}
      >
        Processing
      </Badge>
    );
  }
  if (pr.status === "open") {
    return (
      <Badge variant="light" color="brand">
        Review
      </Badge>
    );
  }
  return (
    <Badge variant="light" color="gray" tt="capitalize">
      {pr.status}
    </Badge>
  );
};

// How far through reviewing it you are; nothing while the agent still
// groups the changes.
const ReviewProgress = ({ pr }: { pr: PullRequestSummary }) => {
  const { review } = pr;
  if (pr.status === "processing") {
    return null;
  }
  if (review.changes === null) {
    return (
      <Text fz={12} c={palette.muted}>
        Not started
      </Text>
    );
  }
  const progress = { total: review.changes, accepted: review.accepted };
  const left = progress.total - progress.accepted;
  return (
    <Stack gap={5}>
      <Group justify="space-between" align="baseline" gap={8}>
        <Text ff="monospace" fz={12} fw={600} c={palette.ink}>
          {Math.floor((progress.accepted / (progress.total || 1)) * 100)}%
        </Text>
        <Text
          fz={12}
          {...(left ? { c: palette.muted } : { c: palette.accent, fw: 600 })}
        >
          {left ? `${left} left` : "accepted"}
        </Text>
      </Group>
      <Bar progress={progress} height={6} />
    </Stack>
  );
};
