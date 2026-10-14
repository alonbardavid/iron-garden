import { Box, Group, Loader, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { PullRequestDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import { langOf } from "../../../logic/syntax";
import { partners, rangeSlice } from "../diff/model";
import { CodeBlock, Lines } from "../diff/rows";
import { useFileDiff } from "../diff/useFileDiff";
import { pullRequestPath } from "../paths";
import { linesText, parseLinesRef, type LinesRef } from "./model";

// Lines of the change an agent's answer points at, as the review shows them.
export const LinesBlock = ({
  pr,
  spec,
}: {
  pr: PullRequestDetail;
  spec: string;
}) => {
  const ref = parseLinesRef(spec);
  const file = ref && pr.files.find((f) => f.path === ref.path);
  if (!ref || !file) {
    return (
      <pre>
        <code>{spec}</code>
      </pre>
    );
  }
  return (
    <Box
      my={4}
      style={{
        border: `1px solid ${palette.card}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Group
        gap={8}
        h={30}
        px={10}
        wrap="nowrap"
        style={{ borderBottom: `1px solid ${palette.line}` }}
      >
        <Link
          to={pullRequestPath(pr, "files", { file: ref.path })}
          style={{ color: palette.ink, minWidth: 0 }}
        >
          <Text span ff="monospace" fz={12} truncate display="block">
            {ref.path}
          </Text>
        </Link>
        <Text span fz={11.5} c={palette.meta} style={{ flexShrink: 0 }}>
          {linesText(ref.start, ref.end)}
        </Text>
      </Group>
      <RangeDiff pr={pr} lines={ref} deleted={file.change === "deleted"} />
    </Box>
  );
};

const RangeDiff = ({
  pr,
  lines: range,
  deleted,
}: {
  pr: PullRequestDetail;
  lines: LinesRef;
  deleted: boolean;
}) => {
  const { file, loaded, error } = useTextDiff(pr, range.path);
  if (error || (loaded && !file)) {
    return (
      <Text p={10} fz={12} c={palette.muted}>
        {error?.message ?? "These lines cannot be shown here."}
      </Text>
    );
  }
  if (!file) {
    return (
      <Group justify="center" p={10}>
        <Loader size="xs" />
      </Group>
    );
  }
  return (
    <Box mah={260} style={{ overflow: "auto" }}>
      <CodeBlock>
        <Lines
          file={file}
          span={rangeSlice(file.lines, range, deleted)}
          layout="unified"
        />
      </CodeBlock>
    </Box>
  );
};

// The file's diff lines, when it is text.
function useTextDiff(pr: PullRequestDetail, path: string) {
  const { diff, error } = useFileDiff(pr, path);
  const file = useMemo(
    () =>
      diff && "lines" in diff
        ? {
            lines: diff.lines,
            lang: langOf(path),
            partners: partners(diff.lines),
          }
        : null,
    [diff, path],
  );
  return { file, loaded: !!diff, error };
}
