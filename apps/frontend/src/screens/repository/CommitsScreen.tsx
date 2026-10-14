import { Button, Group, Paper } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Commit } from "@lib/contract";
import { palette } from "@lib/ds";
import { CodeIcon } from "../../components/icons";
import { Message } from "../../components/Message";
import { Page } from "../../components/Page";
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { CommitSummary } from "./code/CommitSummary";
import { codePath, historyPath } from "./code/paths";
import { RefPicker } from "./code/RefPicker";
import { useRepository } from "./RepositoryLayout";
import { SkeletonList } from "../../components/skeletons";

const PAGE_SIZE = 30;

// A branch's commits, newest first, a page at a time; each one opens its
// changes, or the code as it was then.
export const CommitsScreen = () => {
  const { name } = useRepository();
  const [params] = useSearchParams();
  const ref = params.get("ref") || undefined;
  const page = Math.max(0, Number(params.get("page") ?? 1) - 1 || 0);
  const navigate = useNavigate();
  return (
    <Page
      title="Commits"
      action={
        <RefPicker
          value={ref}
          onChange={(picked) => navigate(historyPath(name, picked))}
        />
      }
    >
      <CommitPage at={ref} page={page} />
    </Page>
  );
};

// A ref's page of history: `at` is a branch or commit, the default branch
// when left out.
const CommitPage = ({ at, page }: { at?: string; page: number }) => {
  const { name } = useRepository();
  const { data, error } = useQuery(
    orpc.repositories.commits.queryOptions({
      input: { name, ref: at, offset: page * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  );
  if (error) {
    return <Message color={palette.removed}>{errorMessage(error)}</Message>;
  }
  if (!data) {
    return <SkeletonList rows={8} badge={false} />;
  }
  if (data.commits.length === 0) {
    return <Message>No commits here.</Message>;
  }
  return (
    <>
      <CommitList commits={data.commits} />
      <Pager at={at} page={page} hasMore={data.hasMore} />
    </>
  );
};

const Pager = ({
  at,
  page,
  hasMore,
}: {
  at?: string;
  page: number;
  hasMore: boolean;
}) => {
  const { name } = useRepository();
  return (
    <Group justify="flex-end" gap={8} mt={12}>
      <Button
        variant="default"
        size="xs"
        component={Link}
        to={historyPath(name, at, page - 1)}
        disabled={page === 0}
      >
        Newer
      </Button>
      <Button
        variant="default"
        size="xs"
        component={Link}
        to={historyPath(name, at, page + 1)}
        disabled={!hasMore}
      >
        Older
      </Button>
    </Group>
  );
};

const CommitList = ({ commits }: { commits: Commit[] }) => (
  <Paper
    withBorder
    style={{ overflow: "hidden", borderColor: palette.card }}
    component="ol"
    aria-label="Commits"
    m={0}
    p={0}
  >
    {commits.map((commit, i) => (
      <CommitRow key={commit.hash} commit={commit} first={i === 0} />
    ))}
  </Paper>
);

const CommitRow = ({ commit, first }: { commit: Commit; first: boolean }) => {
  const { name } = useRepository();
  return (
    <Group
      component="li"
      justify="space-between"
      wrap="nowrap"
      gap={16}
      px={16}
      py={10}
      style={{
        listStyle: "none",
        borderTop: first ? 0 : `1px solid ${palette.line}`,
      }}
    >
      <CommitSummary commit={commit} />
      <Button
        variant="default"
        size="xs"
        leftSection={<CodeIcon size={14} />}
        component={Link}
        to={codePath(name, "", commit.hash)}
        aria-label={`Browse the code at ${commit.hash.slice(0, 7)}`}
        style={{ flexShrink: 0 }}
      >
        Browse code
      </Button>
    </Group>
  );
};
