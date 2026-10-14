import { Button, Group, Loader, SegmentedControl, Text } from "@mantine/core";
import { useState } from "react";
import type {
  GithubPullStatus,
  MergeMethod,
  PullRequestDetail,
} from "@lib/contract";
import { palette } from "@lib/ds";
import { errorMessage } from "../../logic/api/errors";
import { timeAgo } from "../../logic/time";
import { useGithubPull, useMergeActions } from "./github";
import { Section } from "./OverviewSection";

const METHODS: { value: MergeMethod; label: string; button: string }[] = [
  { value: "merge", label: "Merge commit", button: "Merge pull request" },
  { value: "squash", label: "Squash", button: "Squash and merge" },
  { value: "rebase", label: "Rebase", button: "Rebase and merge" },
];

const METHOD_WORDS: Record<MergeMethod, string> = {
  merge: "with a merge commit",
  squash: "squashed into one commit",
  rebase: "by rebasing its commits",
};

// Merging, or how the pull request ended. A repository connected to GitHub
// merges there, once the pull request is on GitHub; any other merges here.
export const MergeBox = ({ pr }: { pr: PullRequestDetail }) => {
  if (pr.status === "processing") {
    return null;
  }
  if (pr.status !== "open") {
    return <Ended pr={pr} />;
  }
  return (
    <Section title="Merge">
      <MergeControls pr={pr} />
    </Section>
  );
};

const Ended = ({ pr }: { pr: PullRequestDetail }) => (
  <Section title={pr.status === "merged" ? "Merged" : "Closed"}>
    <Text fz={13.5} c={palette.body}>
      {pr.status === "merged" ? mergedText(pr) : closedText(pr)}
    </Text>
  </Section>
);

const MergeControls = ({ pr }: { pr: PullRequestDetail }) => {
  const { data: github, error } = useGithubPull(pr);
  if (error) {
    return <ActionError error={errorMessage(error)} />;
  }
  if (!github) {
    return <Loader size="xs" />;
  }
  return github.connected && !github.pull ? (
    <CreateInGithub pr={pr} />
  ) : (
    <MergeButton pr={pr} github={github} />
  );
};

const CreateInGithub = ({ pr }: { pr: PullRequestDetail }) => {
  const { createInGithub } = useMergeActions(pr);
  const { run, busy, error } = useAction(createInGithub);
  return (
    <>
      <Text fz={13} c={palette.body}>
        This repository is connected to GitHub, so it merges there. Create the
        pull request on GitHub first: the reviewed branch is pushed as{" "}
        <code>{pr.branch}</code> and CI starts on it.
      </Text>
      <Group>
        <Button onClick={run} loading={busy}>
          Create in GitHub
        </Button>
      </Group>
      <ActionError error={error} />
    </>
  );
};

const MergeButton = ({
  pr,
  github,
}: {
  pr: PullRequestDetail;
  github: GithubPullStatus;
}) => {
  const [method, setMethod] = useState<MergeMethod>("merge");
  const { merge } = useMergeActions(pr);
  const { run, busy, error } = useAction(() => merge(method));
  return (
    <>
      <Text fz={13} c={palette.body}>
        {github.pull
          ? `Merges GitHub pull request #${github.pull.number} into ${pr.targetBranch}.${blockedText(github.pull)}`
          : `Merges into ${pr.targetBranch} here. ${pr.targetBranch} must not have moved on since the branch left it; if it has, the agent merges it in and refreshes first.`}
      </Text>
      <Group gap={10}>
        <SegmentedControl
          aria-label="Merge method"
          data={METHODS.map(({ value, label }) => ({ value, label }))}
          value={method}
          onChange={(value) => setMethod(value as MergeMethod)}
        />
        <Button color="green" onClick={run} loading={busy}>
          {METHODS.find((m) => m.value === method)!.button}
        </Button>
      </Group>
      <ActionError error={error} />
    </>
  );
};

const ActionError = ({ error }: { error: string | null }) =>
  error ? (
    <Text fz={13} c="red">
      {error}
    </Text>
  ) : null;

function useAction(action: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

// GitHub's own reason it would refuse, when it has one.
function blockedText(pull: NonNullable<GithubPullStatus["pull"]>): string {
  if (pull.mergeable === false) {
    return " GitHub reports conflicts with the target branch.";
  }
  return pull.mergeableState === "blocked"
    ? " GitHub's branch protection is still waiting on required checks or reviews."
    : "";
}

function mergedText(pr: PullRequestDetail): string {
  const merge = pr.merge;
  const how = merge?.method ? ` ${METHOD_WORDS[merge.method]}` : "";
  const who = merge?.by ? ` by ${merge.by}` : pr.github ? " on GitHub" : "";
  const when = merge?.at ? `, ${timeAgo(merge.at)}` : "";
  return `Merged into ${pr.targetBranch}${who}${how}${when}.`;
}

function closedText(pr: PullRequestDetail): string {
  return pr.github?.state === "closed"
    ? `Closed on GitHub (#${pr.github.number}) without merging.`
    : "Closed without merging.";
}
