import { Anchor, Code, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { Commit } from "@lib/contract";
import { palette } from "@lib/ds";
import { timeAgo } from "../../../logic/time";
import { useRepository } from "../RepositoryLayout";
import { commitPath } from "./paths";

// A commit in one line: its message's first line, which opens the commit,
// who made it and when.
export const CommitSummary = ({ commit }: { commit: Commit }) => {
  const { name } = useRepository();
  return (
    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
      <Anchor
        component={Link}
        to={commitPath(name, commit.hash)}
        fz={13}
        fw={500}
        c={palette.ink}
        underline="hover"
        truncate
        title={commit.message}
      >
        {headlineOf(commit.message)}
      </Anchor>
      <Text fz={12.5} c={palette.muted} style={{ flexShrink: 0 }}>
        {commit.author} · {timeAgo(commit.committedAt)}
      </Text>
      <Code fz={11.5} style={{ flexShrink: 0 }}>
        {commit.hash.slice(0, 7)}
      </Code>
    </Group>
  );
};

export const headlineOf = (message: string) => message.split("\n", 1)[0]!;
