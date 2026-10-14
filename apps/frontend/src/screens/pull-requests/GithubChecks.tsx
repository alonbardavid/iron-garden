import { Anchor, Badge, Group, Stack, Text } from "@mantine/core";
import type {
  GithubCheck,
  GithubPullStatus,
  PullRequestDetail,
  ReviewRule,
} from "@lib/contract";
import { palette } from "@lib/ds";
import { errorMessage } from "../../logic/api/errors";
import { RunRows } from "../repository/workflows/WorkflowsScreen";
import { outcomeOf } from "../repository/workflows/status";
import { useGithubPull } from "./github";
import { Section } from "./OverviewSection";
import { useMarks } from "./review";

// The GitHub side of a pull request in a connected repository: its GitHub
// pull request, the checks on its head, the workflows its rules started,
// and the workflow runs.
export const GithubChecks = ({ pr }: { pr: PullRequestDetail }) => {
  const { data: status, error } = useGithubPull(pr);
  if (error) {
    return (
      <Section title="GitHub">
        <Text fz={13} c="red">
          {errorMessage(error)}
        </Text>
      </Section>
    );
  }
  if (!status?.connected) {
    return null;
  }
  return (
    <Section title="GitHub" headline={<PullLink pull={status.pull} />}>
      <WorkflowRules />
      <Checks status={status} />
      {status.runs.length > 0 && <RunRows runs={status.runs} />}
    </Section>
  );
};

const PULL_BADGES = {
  open: { color: "green", label: "Open" },
  closed: { color: "red", label: "Closed" },
  merged: { color: "violet", label: "Merged" },
} as const;

const PullLink = ({ pull }: { pull: GithubPullStatus["pull"] }) => {
  if (!pull) {
    return (
      <Text fz={13} c={palette.muted}>
        No pull request on GitHub yet.
      </Text>
    );
  }
  const badge = PULL_BADGES[pull.state];
  return (
    <Group gap={8}>
      <Anchor href={pull.url} target="_blank" fz={13} fw={500}>
        #{pull.number} on GitHub
      </Anchor>
      <Badge size="sm" variant="light" color={badge.color}>
        {pull.draft && pull.state === "open" ? "Draft" : badge.label}
      </Badge>
    </Group>
  );
};

const Checks = ({ status }: { status: GithubPullStatus }) => {
  if (!status.pull) {
    return (
      <Text fz={13} c={palette.body}>
        Checks run once the branch is on GitHub: create the pull request in
        GitHub below.
      </Text>
    );
  }
  if (status.checks.length === 0) {
    return (
      <Text fz={13} c={palette.muted}>
        No checks have reported on {status.pull.headSha.slice(0, 7)}.
      </Text>
    );
  }
  return (
    <Stack gap={4} component="ul" aria-label="Checks" m={0} p={0}>
      {status.checks.map((check) => (
        <CheckRow key={`${check.source}:${check.name}`} check={check} />
      ))}
    </Stack>
  );
};

const CheckRow = ({ check }: { check: GithubCheck }) => {
  const outcome = outcomeOf(check.status, check.conclusion);
  return (
    <Group component="li" gap={10} wrap="nowrap" style={{ listStyle: "none" }}>
      <Badge
        variant="light"
        color={outcome.color}
        w={84}
        style={{ flexShrink: 0 }}
      >
        {outcome.label}
      </Badge>
      <Text fz={13} truncate style={{ flex: 1 }}>
        {check.name}
      </Text>
      {check.url && (
        <Anchor href={check.url} target="_blank" fz={12.5}>
          Details
        </Anchor>
      )}
    </Group>
  );
};

// The run-workflow rules this revision matched, and whether GitHub started
// each one's workflow.
const WorkflowRules = () => {
  const { marks } = useMarks();
  const rules = (marks?.rules ?? []).filter(
    (rule) => rule.action === "run-workflow" && rule.files.length > 0,
  );
  if (rules.length === 0) {
    return null;
  }
  return (
    <Stack gap={4}>
      {rules.map((rule) => (
        <Text key={rule.id} fz={13} c={palette.body}>
          <Text span fw={600} fz={13}>
            {rule.name}
          </Text>{" "}
          {dispatchText(rule)}
        </Text>
      ))}
    </Stack>
  );
};

function dispatchText(rule: ReviewRule): string {
  const workflow = rule.workflow?.name ?? "its workflow";
  switch (rule.dispatch?.status) {
    case "dispatched":
      return `started ${workflow}.`;
    case "failed":
      return `could not start ${workflow}: ${rule.dispatch.error}`;
    case "waiting":
      return `starts ${workflow} once the pull request is on GitHub.`;
  }
  return `starts ${workflow} once the agent has bracketed this revision.`;
}
