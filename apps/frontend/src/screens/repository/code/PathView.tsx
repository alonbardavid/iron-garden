import {
  Anchor,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PathContents, PathEntry, PathFile } from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../../components/board.module.css";
import { FileIcon, FolderIcon } from "../../../components/icons";
import { Message } from "../../../components/Message";
import { SegmentSwitch } from "../../../components/SegmentSwitch";
import { errorMessage } from "../../../logic/api/errors";
import { formatBytes } from "../../../logic/bytes";
import { useRepository } from "../RepositoryLayout";
import { CodeLines, splitLines } from "./CodeLines";
import { useCodeLink } from "./codeRef";
import { ImageView, previewOf, TextPreview } from "./FilePreview";
import { joinPath, pathPrefixes } from "./paths";
import { useRepositoryPath } from "./useRepositoryPath";
import { SkeletonCode } from "../../../components/skeletons";

type FileMode = "preview" | "code";

const FILE_MODES = [
  { value: "preview", label: "Preview" },
  { value: "code", label: "Code" },
] as const;

// The path you are at: a directory's entries and its README, or a file:
// its lines in their syntax colors, or rendered when it reads better so.
export const PathView = ({ path }: { path: string }) => {
  const { contents, error } = useRepositoryPath(path);
  const [mode, setMode] = useState<FileMode>("preview");
  const previewable =
    contents?.kind === "file" &&
    contents.file.kind === "text" &&
    previewOf(path) !== null;
  return (
    <Stack gap={16}>
      <FileCard
        heading={
          <>
            <Breadcrumbs path={path} />
            {contents?.kind === "file" && <FileSize file={contents.file} />}
            {previewable && (
              <SegmentSwitch
                label="Show the file as"
                options={FILE_MODES}
                value={mode}
                onChange={setMode}
              />
            )}
          </>
        }
      >
        <PathBody
          path={path}
          contents={contents}
          error={error}
          mode={previewable ? mode : "code"}
        />
      </FileCard>
      {contents?.kind === "directory" && (
        <Readme folder={path} entries={contents.entries} />
      )}
    </Stack>
  );
};

const FileCard = ({
  heading,
  children,
}: {
  heading: ReactNode;
  children: ReactNode;
}) => (
  <Paper
    component="article"
    withBorder
    style={{ overflow: "hidden", borderColor: palette.card }}
  >
    <Group
      gap={12}
      mih={48}
      py={8}
      px={16}
      bg={palette.panel}
      style={{ borderBottom: `1px solid ${palette.control}` }}
    >
      {heading}
    </Group>
    {children}
  </Paper>
);

// The repository, then each folder down to path, every one but the last a
// link.
const Breadcrumbs = ({ path }: { path: string }) => {
  const { name } = useRepository();
  const linkTo = useCodeLink();
  const crumbs = [
    { label: name, to: "" },
    ...pathPrefixes(path).map((prefix) => ({
      label: prefix.slice(prefix.lastIndexOf("/") + 1),
      to: prefix,
    })),
  ];
  return (
    <Text
      component="nav"
      aria-label="Path"
      ff="monospace"
      fz={13.5}
      fw={500}
      style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
    >
      {crumbs.map((crumb, i) => (
        <Fragment key={crumb.to}>
          {i > 0 && (
            <Text span inherit c={palette.faint} mx={4}>
              /
            </Text>
          )}
          {i === crumbs.length - 1 ? (
            <Text span inherit aria-current="page">
              {crumb.label}
            </Text>
          ) : (
            <Anchor component={Link} to={linkTo(crumb.to)} inherit>
              {crumb.label}
            </Anchor>
          )}
        </Fragment>
      ))}
    </Text>
  );
};

const FileSize = ({ file }: { file: PathFile }) => (
  <Text fz={12} c={palette.muted}>
    {file.kind === "text"
      ? `${splitLines(file.text).length} lines`
      : formatBytes(file.bytes)}
  </Text>
);

const PathBody = ({
  path,
  contents,
  error,
  mode,
}: {
  path: string;
  contents?: PathContents;
  error: Error | null;
  mode: FileMode;
}) => {
  if (error) {
    return <Message color={palette.removed}>{errorMessage(error)}</Message>;
  }
  if (!contents) {
    return (
      <Paper withBorder style={{ borderColor: palette.card }}>
        <SkeletonCode />
      </Paper>
    );
  }
  if (contents.kind === "directory") {
    return <DirectoryEntries path={path} entries={contents.entries} />;
  }
  return <FileBody path={path} file={contents.file} mode={mode} />;
};

const FileBody = ({
  path,
  file,
  mode,
}: {
  path: string;
  file: PathFile;
  mode: FileMode;
}) => {
  if (file.kind === "image") {
    return <ImageView file={file} alt={path} />;
  }
  if (file.kind === "binary") {
    return <Message>Binary file. It is not shown.</Message>;
  }
  if (file.kind === "too-large") {
    return <Message>Too large to show ({formatBytes(file.bytes)}).</Message>;
  }
  if (file.text.length === 0) {
    return <Message>Empty file.</Message>;
  }
  const preview = previewOf(path);
  if (mode === "preview" && preview) {
    return <TextPreview path={path} kind={preview} text={file.text} />;
  }
  return <CodeLines path={path} text={file.text} />;
};

// A folder's README under its entries, rendered.
const Readme = ({
  folder,
  entries,
}: {
  folder: string;
  entries: PathEntry[];
}) => {
  const readme = entries.find(
    (entry) =>
      entry.type === "file" &&
      /^readme(\.(md|markdown|txt))?$/i.test(entry.name),
  );
  if (!readme) {
    return null;
  }
  return <ReadmeFile path={joinPath(folder, readme.name)} />;
};

const ReadmeFile = ({ path }: { path: string }) => {
  const { contents } = useRepositoryPath(path);
  const linkTo = useCodeLink();
  if (contents?.kind !== "file" || contents.file.kind !== "text") {
    return null;
  }
  return (
    <FileCard
      heading={
        <Group gap={8} c={palette.secondary}>
          <FileIcon />
          <Anchor component={Link} to={linkTo(path)} ff="monospace" fz={13}>
            {path.slice(path.lastIndexOf("/") + 1)}
          </Anchor>
        </Group>
      }
    >
      <Box aria-label="README">
        <FileBody path={path} file={contents.file} mode="preview" />
      </Box>
    </FileCard>
  );
};

const DirectoryEntries = ({
  path,
  entries,
}: {
  path: string;
  entries: PathEntry[];
}) => {
  if (entries.length === 0) {
    return <Message>No files.</Message>;
  }
  return (
    <ul aria-label="Files" style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {entries.map((entry, i) => (
        <DirectoryEntry
          key={entry.name}
          path={joinPath(path, entry.name)}
          entry={entry}
          first={i === 0}
        />
      ))}
    </ul>
  );
};

const DirectoryEntry = ({
  path,
  entry,
  first,
}: {
  path: string;
  entry: PathEntry;
  first: boolean;
}) => {
  const linkTo = useCodeLink();
  return (
    <li style={{ borderTop: first ? 0 : `1px solid ${palette.line}` }}>
      {entry.type === "submodule" ? (
        <Group
          title={`${path} (submodule)`}
          gap={10}
          h={36}
          px={16}
          c={palette.muted}
          wrap="nowrap"
        >
          <EntryLabel entry={entry} />
        </Group>
      ) : (
        <UnstyledButton
          component={Link}
          to={linkTo(path)}
          className={board.item}
          title={path}
          h={36}
          px={16}
          c={palette.ink}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <EntryLabel entry={entry} />
        </UnstyledButton>
      )}
    </li>
  );
};

const EntryLabel = ({ entry }: { entry: PathEntry }) => (
  <>
    <span style={{ display: "flex", color: palette.secondary }}>
      {entry.type === "directory" ? <FolderIcon /> : <FileIcon />}
    </span>
    <Text ff="monospace" fz={12.5} truncate>
      {entry.name}
    </Text>
  </>
);
