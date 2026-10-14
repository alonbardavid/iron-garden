import { Stack, Text } from "@mantine/core";
import { useMemo, useState, type ReactNode } from "react";
import type { PathEntry } from "@lib/contract";
import { palette } from "@lib/ds";
import { FilterInput } from "../../../components/FilterInput";
import { FileIcon } from "../../../components/icons";
import {
  FileRow,
  FileTreeLevel,
  FolderLinkRow,
  indentOf,
  TreeGroup,
} from "../../../components/tree";
import { errorMessage } from "../../../logic/api/errors";
import { fileTree } from "../../../logic/fileTree";
import { useToggleSet } from "../../../logic/useToggleSet";
import { useCodeLink } from "./codeRef";
import { joinPath, pathPrefixes } from "./paths";
import { useRepositoryFiles } from "./useRepositoryFiles";
import { useRepositoryPath } from "./useRepositoryPath";
import { SkeletonTree } from "../../../components/skeletons";

// The repository's folders, each read when it is first opened, or the files
// whose paths match what you type. The folders above the current path open
// as you go to it.
export const CodeTree = ({ current }: { current: string }) => {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  return (
    <Stack gap={8}>
      <FilterInput label="Go to file" value={filter} onChange={setFilter} />
      <nav aria-label="File tree">
        {needle ? (
          <FoundFiles needle={needle} current={current} />
        ) : (
          <BrowsedTree current={current} />
        )}
      </nav>
    </Stack>
  );
};

const BrowsedTree = ({ current }: { current: string }) => {
  const { open, toggle } = useOpenFolders(current);
  return (
    <Directory
      path=""
      depth={0}
      current={current}
      open={open}
      onToggle={toggle}
    />
  );
};

// The most matches shown at once; typing more narrows them.
const MAX_FOUND = 200;

const FoundFiles = ({
  needle,
  current,
}: {
  needle: string;
  current: string;
}) => {
  const { files, error } = useRepositoryFiles(true);
  const linkTo = useCodeLink();
  const [collapsed, toggle] = useToggleSet();
  const found = useMemo(
    () => files?.paths.filter((path) => path.toLowerCase().includes(needle)),
    [files, needle],
  );
  if (error) {
    return (
      <TreeNote depth={0} color={palette.removed}>
        {errorMessage(error)}
      </TreeNote>
    );
  }
  if (!found) {
    return <SkeletonTree />;
  }
  return (
    <>
      <FileTreeLevel
        tree={fileTree(found.slice(0, MAX_FOUND))}
        depth={0}
        collapsed={collapsed}
        onToggle={toggle}
        row={(file, depth) => (
          <FileRow
            key={file.path}
            path={file.path}
            name={file.name}
            depth={depth}
            leading={fileMark}
            current={file.path === current}
            to={linkTo(file.path)}
          />
        )}
      />
      <FoundNote
        shown={Math.min(found.length, MAX_FOUND)}
        total={found.length}
        truncated={files!.truncated}
      />
    </>
  );
};

// What the matches leave out, if anything.
const FoundNote = ({
  shown,
  total,
  truncated,
}: {
  shown: number;
  total: number;
  truncated: boolean;
}) => {
  const notes = [
    total === 0 && "No file matches.",
    shown < total && `The first ${shown} of ${total} matches.`,
    truncated && "The repository is too large to search all of it.",
  ].filter(Boolean);
  return notes.length > 0 ? (
    <Text fz={12} c={palette.muted} px={8} pt={6}>
      {notes.join(" ")}
    </Text>
  ) : null;
};

interface LevelProps {
  depth: number;
  current: string;
  open: ReadonlySet<string>;
  onToggle: (folder: string) => void;
}

const Directory = ({ path, ...level }: LevelProps & { path: string }) => {
  const { contents, error } = useRepositoryPath(path);
  if (error) {
    return (
      <TreeNote depth={level.depth} color={palette.removed}>
        {errorMessage(error)}
      </TreeNote>
    );
  }
  if (!contents) {
    return <SkeletonTree rows={level.depth ? 3 : 7} depth={level.depth} />;
  }
  if (contents.kind !== "directory") {
    return null;
  }
  return (
    <>
      {contents.entries.map((entry) => (
        <Entry key={entry.name} parent={path} entry={entry} {...level} />
      ))}
    </>
  );
};

const Entry = ({
  parent,
  entry,
  ...level
}: LevelProps & { parent: string; entry: PathEntry }) => {
  const linkTo = useCodeLink();
  const path = joinPath(parent, entry.name);
  if (entry.type === "submodule") {
    return (
      <TreeNote depth={level.depth} title={`${path} (submodule)`}>
        {entry.name}
      </TreeNote>
    );
  }
  if (entry.type !== "directory") {
    return (
      <FileRow
        path={path}
        name={entry.name}
        depth={level.depth}
        leading={fileMark}
        current={path === level.current}
        to={linkTo(path)}
      />
    );
  }
  const isOpen = level.open.has(path);
  return (
    <div>
      <FolderLinkRow
        path={path}
        name={entry.name}
        depth={level.depth}
        open={isOpen}
        current={path === level.current}
        to={linkTo(path)}
        onToggle={() => level.onToggle(path)}
      />
      {isOpen && (
        <TreeGroup depth={level.depth}>
          <Directory {...level} path={path} depth={level.depth + 1} />
        </TreeGroup>
      )}
    </div>
  );
};

// Source files carry a plain page mark; diffs use the slot for a change's
// state instead.
const fileMark = (
  <span style={{ display: "flex", color: palette.faint }}>
    <FileIcon size={14} />
  </span>
);

// A row that is not a link: a submodule, or why a folder shows nothing.
const TreeNote = ({
  depth,
  color = palette.muted,
  title,
  children,
}: {
  depth: number;
  color?: string;
  title?: string;
  children: ReactNode;
}) => (
  <Text
    ff="monospace"
    fz={12}
    c={color}
    title={title}
    truncate
    h={30}
    pr={8}
    pl={indentOf(depth) + 22}
    style={{ display: "flex", alignItems: "center" }}
  >
    {children}
  </Text>
);

// Which folders are open: those you opened, and every one above a path you
// went to.
function useOpenFolders(current: string) {
  const [open, toggle, setOpen] = useToggleSet(() => pathPrefixes(current));
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setOpen((prev) => new Set([...prev, ...pathPrefixes(current)]));
  }
  return { open, toggle };
}
