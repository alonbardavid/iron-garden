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
import type { PullRequestSummary } from "@lib/contract";
import { palette } from "@lib/ds";
import { Page } from "../../components/Page";
import { SkeletonRows } from "../../components/skeletons";
import { orpc } from "../../logic/api/orpc";
import { timeAgo } from "../../logic/time";
import { withQuery } from "../../logic/url";
import { useRepository } from "../repository/RepositoryLayout";
import { AuthorLine } from "./AuthorLine";
import { Markdown } from "../../components/markdown/Markdown";
import { pullRequestPath } from "./paths";
import { Bar } from "./ProgressBar";
import { OpenFromGithubButton } from "./OpenFromGithub";

const FILTERS = [
  {
    key: "open",
    label: "Open",
    match: (pr: PullRequestSummary) =>
      pr.status === "open" || pr.status === "processing",
  },
  {
    key: "processing",
    label: "Processing",
    match: (pr: PullRequestSummary) => pr.status === "processing",
  },
  {
    key: "merged",
    label: "Merged",
    match: (pr: PullRequestSummary) => pr.status === "merged",
  },
  {
    key: "closed",
    label: "Closed",
    match: (pr: PullRequestSummary) => pr.status === "closed",
  },
] as const;

export const PullRequestsScreen = () => {
  const { name } = useRepository();
  const { pathname } = useLocation();
  const [search] = useSearchParams();
  const { data: pullRequests } = useQuery(
    orpc.pullRequests.list.queryOptions({ input: { name } }),
  );
  const all = pullRequests ?? [];
  const current =
    FILTERS.find((f) => f.key === search.get("status")) ?? FILTERS[0];
  const shown = all.filter(current.match);
  return (
    <Page title="Pull requests" action={<OpenFromGithubButton name={name} />}>
      <Group align="start" gap={20} wrap="nowrap">
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
              rightSection={
                pullRequests && (
                  <Text size="xs">{all.filter(f.match).length}</Text>
                )
              }
              style={{ borderRadius: 6 }}
            />
          ))}
        </Paper>
        <Paper withBorder radius="md" style={{ flex: 1, overflow: "hidden" }}>
          <PullRequestsBody loaded={pullRequests !== undefined} shown={shown} />
        </Paper>
      </Group>
    </Page>
  );
};

// The list of what the filter shows, or why it shows nothing.
const PullRequestsBody = ({
  loaded,
  shown,
}: {
  loaded: boolean;
  shown: PullRequestSummary[];
}) => {
  if (!loaded) {
    return <SkeletonRows rows={4} />;
  }
  if (shown.length === 0) {
    return (
      <Stack align="center" py={48} gap={4}>
        <Text fw={600}>Nothing here</Text>
        <Text size="sm" c="dimmed">
          Agents open pull requests from their sessions.
        </Text>
      </Stack>
    );
  }
  return <PullRequestTable pullRequests={shown} />;
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
