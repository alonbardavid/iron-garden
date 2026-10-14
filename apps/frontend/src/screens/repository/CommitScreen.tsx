import { Anchor, Button, Code, Group, Paper, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ChangedFile, CommitDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import { FilterInput } from "../../components/FilterInput";
import { CodeIcon, FileIcon } from "../../components/icons";
import { Markdown } from "../../components/markdown/Markdown";
import { Message } from "../../components/Message";
import { Page } from "../../components/Page";
import { SegmentSwitch } from "../../components/SegmentSwitch";
import { FileRow, FileTreeLevel } from "../../components/tree";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";
import { fileTree, treeFiles } from "../../logic/fileTree";
import { timeAgo } from "../../logic/time";
import { useToggleSet } from "../../logic/useToggleSet";
import { Clamped } from "../pull-requests/Clamped";
import { FileDiffBody, FileHeading } from "../pull-requests/diff/FileDiff";
import { fileDiffOf, type FileDiff } from "../pull-requests/diff/useFileDiff";
import { headlineOf } from "./code/CommitSummary";
import { codePath, commitPath } from "./code/paths";
import { useRepository } from "./RepositoryLayout";
import { SkeletonCode, SkeletonText } from "../../components/skeletons";

type FileChange = ChangedFile["change"];

// One commit: its message, and what it changed one file at a time, with the
// code as it was then a click away.
export const CommitScreen = () => {
  const { name } = useRepository();
  const { hash = "" } = useParams();
  const { data, error } = useQuery({
    ...orpc.repositories.commit.queryOptions({ input: { name, hash } }),
    staleTime: Infinity,
  });
  if (error) {
    return (
      <Page>
        <Message color={palette.removed}>{errorMessage(error)}</Message>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        <CommitSkeleton />
      </Page>
    );
  }
  return (
    <Page
      title={headlineOf(data.commit.message)}
      action={
        <Button
          variant="default"
          size="xs"
          leftSection={<CodeIcon size={14} />}
          component={Link}
          to={codePath(name, "", hash)}
        >
          Browse code
        </Button>
      }
    >
      <Stack gap={20}>
        <CommitCard detail={data} />
        <ChangedFiles hash={hash} files={data.files} />
      </Stack>
    </Page>
  );
};

// The rest of the message, who made the commit and when, and the commit it
// follows.
const CommitCard = ({
  detail: { commit, files },
}: {
  detail: CommitDetail;
}) => {
  const body = commit.message.slice(headlineOf(commit.message).length).trim();
  return (
    <Paper
      component="section"
      withBorder
      px={16}
      py={12}
      style={{ borderColor: palette.card }}
      aria-label="Commit"
    >
      <Stack gap={10}>
        {body && (
          <Clamped>
            <Markdown>{body}</Markdown>
          </Clamped>
        )}
        <Group gap={8} fz={12.5} c={palette.muted}>
          <Text inherit>
            {commit.author} · {timeAgo(commit.committedAt)}
          </Text>
          <Code fz={11.5}>{commit.hash}</Code>
          <ParentLinks parents={commit.parents} />
        </Group>
        <Text fz={12.5} c={palette.muted}>
          {filesChangedText(files.length, commit.parents.length)}
        </Text>
      </Stack>
    </Paper>
  );
};

const ParentLinks = ({ parents }: { parents: string[] }) => {
  const { name } = useRepository();
  if (parents.length === 0) {
    return null;
  }
  return (
    <Text inherit>
      {parents.length > 1 ? "Parents" : "Parent"}{" "}
      {parents.map((parent, i) => (
        <span key={parent}>
          {i > 0 && ", "}
          <Anchor
            component={Link}
            to={commitPath(name, parent)}
            ff="monospace"
            fz={12}
          >
            {parent.slice(0, 7)}
          </Anchor>
        </span>
      ))}
    </Text>
  );
};

const filesChangedText = (files: number, parents: number) =>
  `${files} ${files === 1 ? "file" : "files"} changed` +
  (parents > 1 ? ", against the first parent" : "");

// The changed files on the left, one diff at a time.
const ChangedFiles = ({
  hash,
  files,
}: {
  hash: string;
  files: ChangedFile[];
}) => {
  const selected = useSearchParams()[0].get("file");
  const ordered = useMemo(
    () => treeFiles(fileTree(files.map((f) => f.path))),
    [files],
  );
  const path = selected && ordered.includes(selected) ? selected : ordered[0];
  const changes = useMemo(
    () => new Map(files.map((f) => [f.path, f.change])),
    [files],
  );
  if (!path) {
    return <Message>This commit changes no file.</Message>;
  }
  return (
    <Group align="start" gap={20} wrap="nowrap">
      <ChangedFileTree
        hash={hash}
        ordered={ordered}
        changes={changes}
        current={path}
      />
      <FileArticle
        key={path}
        hash={hash}
        path={path}
        change={changes.get(path)!}
      />
    </Group>
  );
};

const ChangedFileTree = ({
  hash,
  ordered,
  changes,
  current,
}: {
  hash: string;
  ordered: string[];
  changes: ReadonlyMap<string, FileChange>;
  current: string;
}) => {
  const { name } = useRepository();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const tree = useMemo(
    () => fileTree(ordered.filter((f) => f.toLowerCase().includes(needle))),
    [ordered, needle],
  );
  const [collapsed, toggle] = useToggleSet();
  return (
    <Paper
      component="aside"
      aria-label="Changed files"
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
      <Stack gap={8}>
        <FilterInput
          label="Filter changed files"
          value={filter}
          onChange={setFilter}
        />
        <nav aria-label="File tree">
          <FileTreeLevel
            tree={tree}
            depth={0}
            collapsed={collapsed}
            onToggle={toggle}
            row={(file, depth) => (
              <FileRow
                key={file.path}
                path={file.path}
                name={file.name}
                depth={depth}
                leading={<ChangeMark change={changes.get(file.path)!} />}
                current={file.path === current}
                to={commitPath(name, hash, file.path)}
              />
            )}
          />
        </nav>
      </Stack>
    </Paper>
  );
};

const CHANGE_MARKS = {
  added: { letter: "A", color: palette.added, label: "Added" },
  modified: { letter: "M", color: palette.secondary, label: "Modified" },
  deleted: { letter: "D", color: palette.removed, label: "Deleted" },
} as const;

const ChangeMark = ({ change }: { change: FileChange }) => {
  const { letter, color, label } = CHANGE_MARKS[change];
  return (
    <Text
      span
      ff="monospace"
      fz={11}
      fw={600}
      c={color}
      w={14}
      ta="center"
      aria-label={label}
      title={label}
    >
      {letter}
    </Text>
  );
};

const SVG_MODES = [
  { value: "code", label: "Code" },
  { value: "preview", label: "Preview" },
] as const;

// A changed file's diff, and the file as the commit left it.
const FileArticle = ({
  hash,
  path,
  change,
}: {
  hash: string;
  path: string;
  change: FileChange;
}) => {
  const { diff, error } = useCommitFileDiff(hash, path);
  const [mode, setMode] = useState<"code" | "preview">("code");
  const svg = /\.svg$/i.test(path) && !!diff && "lines" in diff;
  return (
    <Paper
      component="article"
      withBorder
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        borderColor: palette.card,
      }}
    >
      <FileHeading path={path} diff={diff}>
        {svg && (
          <SegmentSwitch
            label="Show the change as"
            options={SVG_MODES}
            value={mode}
            onChange={setMode}
          />
        )}
        <ViewFileButton hash={hash} path={path} change={change} />
      </FileHeading>
      <FileDiffBody
        path={path}
        diff={diff}
        error={error}
        preview={svg && mode === "preview"}
      />
    </Paper>
  );
};

// A commit never changes, so each of its files is fetched once.
function useCommitFileDiff(
  hash: string,
  path: string,
): { diff?: FileDiff; error: Error | null } {
  const { name } = useRepository();
  const { data, error } = useQuery({
    ...orpc.repositories.commitFile.queryOptions({
      input: { name, hash, path },
    }),
    staleTime: Infinity,
  });
  const diff = useMemo(() => data && fileDiffOf(data), [data]);
  return { diff, error };
}

// The file as the commit left it; a deleted file has none.
const ViewFileButton = ({
  hash,
  path,
  change,
}: {
  hash: string;
  path: string;
  change: FileChange;
}) => {
  const { name } = useRepository();
  if (change === "deleted") {
    return null;
  }
  return (
    <Button
      variant="default"
      size="xs"
      leftSection={<FileIcon size={14} />}
      component={Link}
      to={codePath(name, path, hash)}
      aria-label={`View ${path} at ${hash.slice(0, 7)}`}
    >
      View file
    </Button>
  );
};

// The commit's summary and its first file, while they load.
const CommitSkeleton = () => (
  <Stack gap={16}>
    <Paper withBorder radius="md" p={18}>
      <SkeletonText lines={2} />
    </Paper>
    <Paper withBorder radius="md">
      <SkeletonCode lines={16} />
    </Paper>
  </Stack>
);
