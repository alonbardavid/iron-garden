import { Group, Paper, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { PullRequestDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import { FilterInput } from "../../components/FilterInput";
import { ArrowRightIcon } from "../../components/icons";
import { SegmentSwitch } from "../../components/SegmentSwitch";
import { FileRow, FileTreeLevel } from "../../components/tree";
import { OutlineButton } from "./diff/controls";
import { FileDiffBody, FileHeading } from "./diff/FileDiff";
import { useFileDiff } from "./diff/useFileDiff";
import { fileTree, treeFiles } from "../../logic/fileTree";
import { useToggleSet } from "../../logic/useToggleSet";
import { generatedFiles } from "./files";
import { Legend } from "./GroupsTab";
import { pullRequestPath } from "./paths";
import { stateOf } from "./progress";
import { useMarks } from "./review";

// Review by file: the changed files on the left, one diff at a time.
export const FilesTab = ({ pr }: { pr: PullRequestDetail }) => {
  const selected = useSearchParams()[0].get("file");
  const [filter, setFilter] = useState("");
  const ordered = useMemo(
    () => treeFiles(fileTree(pr.files.map((f) => f.path))),
    [pr.files],
  );
  const path = selected && ordered.includes(selected) ? selected : ordered[0];
  const next = path ? ordered[ordered.indexOf(path) + 1] : undefined;
  const generated = useMemo(() => generatedFiles(pr), [pr]);
  const needle = filter.trim().toLowerCase();
  const tree = useMemo(
    () => fileTree(ordered.filter((f) => f.toLowerCase().includes(needle))),
    [ordered, needle],
  );
  const [collapsed, toggle] = useToggleSet();
  const { marks } = useMarks();
  return (
    <Group align="start" gap={20} wrap="nowrap">
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
                  leading={
                    marks && (
                      <FileState
                        state={stateOf(
                          marks.progress(marks.changes(file.path)),
                        )}
                      />
                    )
                  }
                  current={file.path === path}
                  to={pullRequestPath(pr, "files", { file: file.path })}
                />
              )}
            />
          </nav>
        </Stack>
      </Paper>
      <Stack gap={14} style={{ flex: 1, minWidth: 0 }}>
        {path && (
          <FileArticle
            key={path}
            pr={pr}
            path={path}
            generated={generated.has(path)}
          />
        )}
        {next && (
          <Group justify="flex-end" gap={12}>
            <Text fz={12.5} c={palette.muted}>
              Next file
            </Text>
            <OutlineButton
              height={34}
              to={pullRequestPath(pr, "files", { file: next })}
            >
              <Text span ff="monospace" fz={12}>
                {next.slice(next.lastIndexOf("/") + 1)}
              </Text>
              <ArrowRightIcon />
            </OutlineButton>
          </Group>
        )}
        <Legend />
      </Stack>
    </Group>
  );
};

const FileState = ({ state }: { state: "done" | "partial" | "none" }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    role="img"
    aria-label={
      state === "done"
        ? "Accepted"
        : state === "partial"
          ? "Partly accepted"
          : "Not accepted"
    }
  >
    {state === "done" ? (
      <>
        <circle cx="8" cy="8" r="7" fill={palette.accentFill} />
        <path
          d="m5 8.25 2 2 4-4.5"
          fill="none"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ) : (
      <>
        <circle
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          stroke={state === "partial" ? palette.accent : palette.faint}
          strokeWidth="1.5"
        />
        {state === "partial" && (
          <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill={palette.accent} />
        )}
      </>
    )}
  </svg>
);

const SVG_MODES = [
  { value: "code", label: "Code" },
  { value: "preview", label: "Preview" },
] as const;

const FileArticle = ({
  pr,
  path,
  generated,
}: {
  pr: PullRequestDetail;
  path: string;
  generated: boolean;
}) => {
  const [loaded, setLoaded] = useState(!generated);
  const { diff, error } = useFileDiff(pr, path, loaded);
  const [mode, setMode] = useState<"code" | "preview">("code");
  const svg = /\.svg$/i.test(path) && !!diff && "lines" in diff;
  return (
    <Paper
      component="article"
      withBorder
      style={{ overflow: "hidden", borderColor: palette.card }}
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
      </FileHeading>
      <FileDiffBody
        pr={pr}
        path={path}
        diff={diff}
        error={error}
        loaded={loaded}
        onLoad={() => setLoaded(true)}
        preview={svg && mode === "preview"}
      />
    </Paper>
  );
};
