import { Button, Group, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { palette } from "@lib/ds";
import { HistoryIcon } from "../../../components/icons";
import { Message } from "../../../components/Message";
import { errorMessage } from "../../../logic/api/errors";
import { useRepository } from "../RepositoryLayout";
import { CodeRefContext, useCodeRef, useRefCommit } from "./codeRef";
import { CodeTree } from "./CodeTree";
import { CommitSummary } from "./CommitSummary";
import { codePath, historyPath, isCommitHash, normalizePath } from "./paths";
import { PathView } from "./PathView";
import { RefPicker } from "./RefPicker";
import { SkeletonCode, SkeletonTree } from "../../../components/skeletons";

// The repository's code at ?ref= (a branch or commit, the default branch
// when left out): the file tree on the left, the path in ?path= on the right.
export const CodeBrowser = () => {
  const [params] = useSearchParams();
  const ref = params.get("ref") || undefined;
  const path = normalizePath(params.get("path") ?? "");
  const { commit, error } = useRefCommit(ref);
  if (error) {
    return <Message color={palette.removed}>{errorMessage(error)}</Message>;
  }
  if (commit === undefined) {
    return <CodeBrowserSkeleton />;
  }
  if (commit === null) {
    return <MissingRef name={ref ?? ""} />;
  }
  return (
    <CodeRefContext.Provider value={{ ref, commit }}>
      <CodeAtRef path={path} />
    </CodeRefContext.Provider>
  );
};

const CodeAtRef = ({ path }: { path: string }) => (
  <Stack gap={12}>
    <CodeToolbar path={path} />
    <Group align="start" gap={20} wrap="nowrap">
      <Paper
        component="aside"
        aria-label="Files"
        w={300}
        p={10}
        withBorder
        style={{
          flexShrink: 0,
          borderColor: palette.card,
          position: "sticky",
          top: 16,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
        }}
      >
        <CodeTree current={path} />
      </Paper>
      <div style={{ flex: 1, minWidth: 0 }}>
        <PathView key={path} path={path} />
      </div>
    </Group>
  </Stack>
);

// The branch picker, the commit being looked at, and its history.
const CodeToolbar = ({ path }: { path: string }) => {
  const { name } = useRepository();
  const { ref, commit } = useCodeRef();
  const navigate = useNavigate();
  return (
    <Group gap={16} wrap="nowrap">
      <RefPicker
        value={ref}
        onChange={(picked) => navigate(codePath(name, path, picked))}
      />
      <Paper
        withBorder
        px={12}
        py={6}
        style={{ flex: 1, minWidth: 0, borderColor: palette.card }}
      >
        <CommitSummary commit={commit} />
      </Paper>
      <Button
        variant="default"
        size="xs"
        leftSection={<HistoryIcon />}
        component={Link}
        to={historyPath(name, ref && isCommitHash(ref) ? undefined : ref)}
      >
        History
      </Button>
    </Group>
  );
};

// The toolbar, tree and file, shaped as they will load.
const CodeBrowserSkeleton = () => (
  <Stack gap={12}>
    <Group gap={16} wrap="nowrap">
      <Skeleton height={30} width={220} radius="sm" />
      <Skeleton height={30} radius="sm" style={{ flex: 1 }} />
      <Skeleton height={30} width={90} radius="sm" />
    </Group>
    <Group align="start" gap={20} wrap="nowrap">
      <Paper w={300} p={10} withBorder style={{ borderColor: palette.card }}>
        <SkeletonTree />
      </Paper>
      <Paper withBorder style={{ flex: 1, borderColor: palette.card }}>
        <SkeletonCode />
      </Paper>
    </Group>
  </Stack>
);

const MissingRef = ({ name }: { name: string }) => {
  const repository = useRepository();
  return (
    <Message>
      <Text inherit>
        There is no branch or commit named <code>{name}</code>.
      </Text>
      <Button
        variant="default"
        size="xs"
        component={Link}
        to={codePath(repository.name, "")}
      >
        Go to {repository.defaultBranch}
      </Button>
    </Message>
  );
};
