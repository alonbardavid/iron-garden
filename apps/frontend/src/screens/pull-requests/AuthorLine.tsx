import { Group, Text } from "@mantine/core";
import type { PullRequestSummary } from "@lib/contract";
import { palette } from "@lib/ds";

// Who wrote the pull request: its agent and the agent's owner, or for one
// opened from GitHub, the person who opened it.
export const AuthorLine = ({
  pr,
}: {
  pr: Pick<PullRequestSummary, "agent" | "origin" | "openedBy">;
}) => {
  const author =
    pr.origin === "github"
      ? { name: pr.openedBy ?? "Someone", tag: "GitHub", for: null }
      : pr.agent && {
          name: pr.agent.name,
          tag: "agent",
          for: pr.agent.ownerName,
        };
  return author ? (
    <Group gap={8} wrap="nowrap" fz={13} c={palette.secondary}>
      <Text span inherit fw={600} c={palette.ink}>
        {author.name}
      </Text>
      <Text
        span
        px={5}
        fz={11}
        fw={500}
        lh="16px"
        bg={palette.hover}
        style={{ borderRadius: 4 }}
      >
        {author.tag}
      </Text>
      {author.for && (
        <Text span inherit>
          for {author.for}
        </Text>
      )}
    </Group>
  ) : (
    <Text span fz={13} c="dimmed">
      unknown author
    </Text>
  );
};
