import {
  Badge,
  Button,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import type { ReactNode } from "react";
import type { WorkflowArtifact, WorkflowJob } from "@lib/contract";
import { palette } from "@lib/ds";
import { ShowMore } from "../../../components/ShowMore";
import { orpc } from "../../../logic/api/orpc";
import { errorMessage } from "../../../logic/api/errors";
import {
  nextPage,
  type PagedList,
  usePagedList,
} from "../../../logic/api/paging";
import { formatBytes } from "../../../logic/bytes";
import { useRepository } from "../RepositoryLayout";
import { outcomeOf } from "./status";

// A run's jobs and artifacts, read from GitHub a page at a time when opened.
export const RunDetails = ({ runId }: { runId: number }) => (
  <SimpleGrid
    cols={2}
    spacing={24}
    px={16}
    pb={14}
    pt={4}
    style={{ background: palette.panel }}
  >
    <Jobs runId={runId} />
    <Artifacts runId={runId} />
  </SimpleGrid>
);

const Jobs = ({ runId }: { runId: number }) => {
  const { name } = useRepository();
  const list = usePagedList(
    orpc.repositories.github.jobs.infiniteOptions({
      input: (cursor) => ({ name, runId, cursor }),
      ...nextPage,
    }),
  );
  return (
    <Section
      title="Jobs"
      list={list}
      empty="No jobs."
      renderItem={(job) => <JobRow key={job.id} job={job} />}
    />
  );
};

const JobRow = ({ job }: { job: WorkflowJob }) => {
  const openLogs = useOpenLink((name) =>
    orpc.repositories.github.jobLogs.call({ name, jobId: job.id }),
  );
  const outcome = outcomeOf(job.status, job.conclusion);
  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap={8} wrap="nowrap">
        <Badge variant="dot" color={outcome.color} size="sm">
          {outcome.label}
        </Badge>
        <Text size="sm">{job.name}</Text>
      </Group>
      <Button
        variant="subtle"
        size="compact-xs"
        disabled={job.status !== "completed"}
        onClick={openLogs}
      >
        Logs
      </Button>
    </Group>
  );
};

const Artifacts = ({ runId }: { runId: number }) => {
  const { name } = useRepository();
  const list = usePagedList(
    orpc.repositories.github.artifacts.infiniteOptions({
      input: (cursor) => ({ name, runId, cursor }),
      ...nextPage,
    }),
  );
  return (
    <Section
      title="Artifacts"
      list={list}
      empty="No artifacts."
      renderItem={(artifact) => (
        <ArtifactRow key={artifact.id} artifact={artifact} />
      )}
    />
  );
};

const ArtifactRow = ({ artifact }: { artifact: WorkflowArtifact }) => {
  const download = useOpenLink((name) =>
    orpc.repositories.github.artifactDownload.call({
      name,
      artifactId: artifact.id,
    }),
  );
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm">
        {artifact.name}{" "}
        <Text span size="xs" c="dimmed">
          {formatBytes(artifact.sizeInBytes)}
        </Text>
      </Text>
      <Button
        variant="subtle"
        size="compact-xs"
        disabled={artifact.expired}
        onClick={download}
      >
        {artifact.expired ? "Expired" : "Download"}
      </Button>
    </Group>
  );
};

interface SectionProps<T> {
  title: string;
  list: PagedList & { items: T[] | undefined; error: unknown };
  empty: string;
  renderItem: (item: T) => ReactNode;
}

const Section = <T,>({ title, ...body }: SectionProps<T>) => (
  <Stack gap={6}>
    <Text size="xs" fw={600} c={palette.secondary} tt="uppercase">
      {title}
    </Text>
    <SectionBody {...body} />
  </Stack>
);

const SectionBody = <T,>({
  list,
  empty,
  renderItem,
}: Omit<SectionProps<T>, "title">) => {
  const { items, error } = list;
  if (error) {
    return (
      <Text size="sm" c="red">
        {errorMessage(error)}
      </Text>
    );
  }
  if (!items) {
    return <Loader size="xs" />;
  }
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  }
  return (
    <>
      {items.map(renderItem)}
      <ShowMore list={list} />
    </>
  );
};

// GitHub hands out logs and artifacts as short-lived links, so each is asked
// for only when clicked. The tab opens on the click itself, where a popup
// blocker allows it, and follows the link once it arrives.
function useOpenLink(issue: (name: string) => Promise<{ url: string }>) {
  const { name } = useRepository();
  return async () => {
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      tab.opener = null;
    }
    try {
      const { url } = await issue(name);
      if (tab) {
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      throw err;
    }
  };
}
