import { Text, UnstyledButton } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { palette } from "@lib/ds";
import type { FileTree } from "../logic/fileTree";
import board from "./board.module.css";
import { ChevronIcon, FolderIcon, FolderOpenIcon } from "./icons";

// The rows of a file tree, as the changed files and the code browser show
// them: a folder steps its children in, under a guide line.

// Each level of the tree steps in by one row icon and its gap.
export const indentOf = (depth: number) => 8 + depth * 16;

// A whole tree already in hand, its folders open but those in `collapsed`;
// `row` draws each file.
export const FileTreeLevel = ({
  tree,
  depth,
  collapsed,
  onToggle,
  row,
}: {
  tree: FileTree;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (folder: string) => void;
  row: (file: FileTree["files"][number], depth: number) => ReactNode;
}) => (
  <>
    {tree.folders.map((folder) => {
      const open = !collapsed.has(folder.path);
      return (
        <div key={folder.path}>
          <FolderRow
            path={folder.path}
            name={folder.name}
            depth={depth}
            open={open}
            onToggle={() => onToggle(folder.path)}
          />
          {open && (
            <TreeGroup depth={depth}>
              <FileTreeLevel
                tree={folder}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                row={row}
              />
            </TreeGroup>
          )}
        </div>
      );
    })}
    {tree.files.map((file) => row(file, depth))}
  </>
);

// A folder that opens and closes in place.
export const FolderRow = ({
  path,
  name,
  depth,
  open,
  onToggle,
}: {
  path: string;
  name: string;
  depth: number;
  open: boolean;
  onToggle: () => void;
}) => (
  <UnstyledButton
    className={board.item}
    aria-expanded={open}
    title={path}
    onClick={onToggle}
    h={30}
    w="100%"
    pr={8}
    pl={indentOf(depth)}
    c={palette.secondary}
    style={{ display: "flex", alignItems: "center", gap: 2, borderRadius: 6 }}
  >
    <Disclosure open={open} />
    <FolderLabel name={name} open={open} />
  </UnstyledButton>
);

// A folder you can go to; its chevron opens and closes it in place.
export const FolderLinkRow = ({
  path,
  name,
  depth,
  open,
  current,
  to,
  onToggle,
}: {
  path: string;
  name: string;
  depth: number;
  open: boolean;
  current: boolean;
  to: string;
  onToggle: () => void;
}) => (
  <div
    className={current ? undefined : board.item}
    style={{
      display: "flex",
      alignItems: "center",
      height: 30,
      paddingLeft: indentOf(depth),
      borderRadius: 6,
      background: current ? palette.accentSoft : "transparent",
      color: palette.secondary,
    }}
  >
    <UnstyledButton
      aria-expanded={open}
      aria-label={`${open ? "Close" : "Open"} ${path}`}
      onClick={onToggle}
      h="100%"
      c="inherit"
      style={{ display: "flex", alignItems: "center", marginRight: 2 }}
    >
      <Disclosure open={open} />
    </UnstyledButton>
    <UnstyledButton
      component={Link}
      to={to}
      aria-current={current ? "page" : undefined}
      title={path}
      h="100%"
      pr={8}
      c="inherit"
      style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}
    >
      <FolderLabel name={name} open={open} />
    </UnstyledButton>
  </div>
);

// A folder's children, stepped in under a guide line.
export const TreeGroup = ({
  depth,
  children,
}: {
  depth: number;
  children: ReactNode;
}) => (
  <div role="group" style={{ position: "relative" }}>
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: indentOf(depth) + 6.5,
        width: 1,
        background: palette.line,
      }}
    />
    {children}
  </div>
);

// A file, with room before its name for a mark of its state.
export const FileRow = ({
  path,
  name,
  depth,
  leading,
  current,
  to,
}: {
  path: string;
  name: string;
  depth: number;
  leading?: ReactNode;
  current: boolean;
  to: string;
}) => (
  <UnstyledButton
    component={Link}
    to={to}
    className={current ? undefined : board.item}
    aria-current={current ? "page" : undefined}
    title={path}
    h={30}
    w="100%"
    pr={8}
    pl={indentOf(depth)}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderRadius: 6,
      background: current ? palette.accentSoft : "transparent",
    }}
  >
    <span style={{ flex: "0 0 14px", display: "flex" }}>{leading}</span>
    <Text ff="monospace" fz={12} truncate>
      {name}
    </Text>
  </UnstyledButton>
);

const Disclosure = ({ open }: { open: boolean }) => (
  <span
    style={{
      flex: "0 0 14px",
      display: "flex",
      transform: open ? undefined : "rotate(-90deg)",
    }}
  >
    <ChevronIcon />
  </span>
);

const FolderLabel = ({ name, open }: { name: string; open: boolean }) => (
  <>
    <span style={{ display: "flex", marginRight: 4 }}>
      {open ? <FolderOpenIcon /> : <FolderIcon />}
    </span>
    <Text ff="monospace" fz={12} truncate>
      {name}
    </Text>
  </>
);
