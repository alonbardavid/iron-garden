import {
  Anchor,
  Badge,
  Button,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { WorkflowRun } from "@lib/contract";
import { palette } from "@lib/ds";
import { BranchIcon, ChevronIcon } from "../../../components/icons";
import { Message } from "../../../components/Message";
import { Page } from "../../../components/Page";
import { orpc } from "../../../logic/api/orpc";
import { errorMessage } from "../../../logic/api/errors";
import { timeAgo } from "../../../logic/time";
import { codePath } from "../code/paths";
import { useRepository } from "../RepositoryLayout";
import { RunDetails } from "./RunDetails";
import { outcomeOf } from "./status";
import { SkeletonList } from "../../../components/skeletons";

// The GitHub Actions runs of a mirrored repository, newest first; each one
// opens to its jobs and artifacts.
export const WorkflowsScreen = () => {
  const { name } = useRepository();
  const { data: connection } = useQuery(
    orpc.repositories.github.get.queryOptions({ input: { name } }),
  );
  return (
    <Page
      title="Workflows"
      action={
        connection && (
          <Anchor
            href={`${connection.htmlUrl}/actions`}
            target="_blank"
            size="sm"
          >
            Open on GitHub
          </Anchor>
        )
      }
    >
      <RunList />
    </Page>
  );
};

const RunList = () => {
  const { name } = useRepository();
  const { data: runs, error } = useQuery(
    orpc.repositories.github.runs.queryOptions({ input: { name, limit: 50 } }),
  );
  if (error) {
    return <Message color={palette.removed}>{errorMessage(error)}</Message>;
  }
  if (!runs) {
    return <SkeletonList rows={6} />;
  }
  if (runs.length === 0) {
    return (
      <Message>
        No workflow runs yet. They appear as GitHub reports them, or when the
        repository syncs.
      </Message>
    );
  }
  return <RunRows runs={runs} />;
};

// Runs as a list, each opening to its jobs and artifacts.
export const RunRows = ({ runs }: { runs: WorkflowRun[] }) => (
  <Paper
    withBorder
    component="ol"
    aria-label="Workflow runs"
    m={0}
    p={0}
    style={{ overflow: "hidden", borderColor: palette.card }}
  >
    {runs.map((run, i) => (
      <RunRow key={run.runId} run={run} first={i === 0} />
    ))}
  </Paper>
);

const RunRow = ({ run, first }: { run: WorkflowRun; first: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <li
      style={{
        listStyle: "none",
        borderTop: first ? undefined : `1px solid ${palette.line}`,
      }}
    >
      <Group justify="space-between" px={16} py={10} wrap="nowrap">
        <RunSummary run={run} />
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          aria-expanded={open}
          aria-label={`Details of ${run.workflowName} #${run.runNumber}`}
          rightSection={<ChevronIcon up={open} />}
          onClick={() => setOpen((o) => !o)}
        >
          Details
        </Button>
      </Group>
      <Collapse in={open}>{open && <RunDetails runId={run.runId} />}</Collapse>
    </li>
  );
};

const RunSummary = ({ run }: { run: WorkflowRun }) => {
  const outcome = outcomeOf(run.status, run.conclusion);
  return (
    <Group gap={12} wrap="nowrap" style={{ minWidth: 0 }}>
      <Badge variant="light" color={outcome.color} w={84}>
        {outcome.label}
      </Badge>
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Anchor href={run.htmlUrl} target="_blank" fw={600} size="sm" c="dark">
          {run.workflowName} #{run.runNumber}
          {run.runAttempt > 1 && ` (attempt ${run.runAttempt})`}
        </Anchor>
        <RunMeta run={run} />
      </Stack>
    </Group>
  );
};

// Where the run ran: its branch and commit (opening the code as it was),
// what triggered it, and when.
const RunMeta = ({ run }: { run: WorkflowRun }) => {
  const { name } = useRepository();
  return (
    <Group gap={10} fz={12} c={palette.secondary} wrap="nowrap">
      {run.headBranch && (
        <Group gap={4} wrap="nowrap">
          <BranchIcon size={12} />
          {run.headBranch}
        </Group>
      )}
      <Anchor
        component={Link}
        to={codePath(name, "", run.headSha)}
        ff="monospace"
        fz={12}
      >
        {run.headSha.slice(0, 7)}
      </Anchor>
      <Text span fz={12}>
        {run.event} · {timeAgo(run.startedAt)}
      </Text>
    </Group>
  );
};
