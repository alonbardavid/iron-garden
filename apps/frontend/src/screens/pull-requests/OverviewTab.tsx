import {
  Anchor,
  Box,
  Code,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PullRequestDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import { timeAgo } from "../../logic/time";
import { AuthorLine } from "./AuthorLine";
import { Markdown } from "../../components/markdown/Markdown";
import { grouperName, pullRequestPath } from "./paths";
import { Bar } from "./ProgressBar";
import { joinWords } from "../../logic/rules";
import { isDone, rangesChanges, ruleChanges, type Marks } from "./progress";
import { ruleGroupId, useMarks } from "./review";
import { GithubChecks } from "./GithubChecks";
import { Clamped } from "./Clamped";
import { MergeBox } from "./MergeBox";
import { Section } from "./OverviewSection";
import { linesText } from "./diff/notes";
import { useDiscussion, type Thread } from "./discussion";
import { Avatar } from "./notes/parts";
import { outgoingText } from "./ReviewButton";
import { CheckIcon } from "../../components/icons";

export const OverviewTab = ({ pr }: { pr: PullRequestDetail }) => (
  <Group align="start" gap={20} wrap="nowrap">
    <Stack gap={14} style={{ flex: 1, minWidth: 0 }}>
      <Section title="What this change does" meta={writtenBy(pr)}>
        {pr.description ? (
          <Clamped>
            <Markdown>{pr.description}</Markdown>
          </Clamped>
        ) : (
          <Text fz={13.5} c={palette.muted}>
            The agent did not describe this change.
          </Text>
        )}
      </Section>
      <ReadyToMerge pr={pr} />
      <GithubChecks pr={pr} />
      <MergeBox pr={pr} />
    </Stack>
    <Aside pr={pr} />
  </Group>
);

const ReadyToMerge = ({ pr }: { pr: PullRequestDetail }) => {
  const { marks } = useMarks();
  const { threads, drafts } = useDiscussion();
  // No review to count while the agent still groups the changes.
  const review =
    pr.status !== "processing" && marks ? reviewOf(pr, marks) : undefined;
  const openFlags = flagsOf(threads).filter((t) => !t.root.resolved).length;
  return (
    <Section
      title="Ready to merge?"
      headline={
        review && (
          <Text
            fz={13}
            fw={500}
            c={
              review.left === 0 && openFlags === 0
                ? palette.successInk
                : palette.body
            }
          >
            {headline(review, openFlags)}
          </Text>
        )
      }
    >
      <Condition
        icon={
          pr.status === "processing" ? (
            <Loader size={14} color={palette.warningInk} />
          ) : review?.left === 0 ? (
            <Done />
          ) : (
            <Open />
          )
        }
        title="Review"
        link={
          review?.left !== 0 && (
            <Anchor
              component={Link}
              to={pullRequestPath(
                pr,
                pr.status === "processing" ? "files" : "brackets",
              )}
              fz={12.5}
              fw={500}
              style={{ whiteSpace: "nowrap" }}
            >
              {pr.status === "processing"
                ? "Start in Files"
                : "Continue in Brackets"}
            </Anchor>
          )
        }
        detail={
          pr.status === "processing"
            ? `${grouperName(pr)} is splitting the changes in ${pr.files.length} files into reviewable brackets.`
            : !review
              ? "Counting the changes."
              : `${
                  review.left === 0
                    ? "You accepted every change."
                    : `${review.left} of ${review.progress.total} changes are still waiting on you.`
                }${drafts.length > 0 ? ` ${outgoingText(drafts)} with your review.` : ""}`
        }
      >
        {review && (
          <Group gap={12}>
            <Bar progress={review.progress} width={220} height={6} />
            <Text fz={12} c={palette.meta}>
              {[
                `${review.progress.accepted} of ${review.progress.total} accepted`,
                `${review.files} of ${pr.files.length} files`,
                ...(pr.groups.length > 0
                  ? [`${review.groups} of ${pr.groups.length} brackets`]
                  : []),
              ].join(" · ")}
            </Text>
          </Group>
        )}
      </Condition>
      <FlagsCondition pr={pr} />
      {marks && <RulesCondition pr={pr} marks={marks} />}
    </Section>
  );
};

// "Not yet. Your review is 41% through, and 1 flag is open."
function headline(
  review: NonNullable<ReturnType<typeof reviewOf>>,
  openFlags: number,
): string {
  const flags =
    openFlags === 1 ? "1 flag is open" : `${openFlags} flags are open`;
  if (review.left === 0) {
    return openFlags === 0
      ? "Your review is done."
      : `Your review is done, but ${flags}.`;
  }
  const through = `Not yet. Your review is ${review.percent}% through`;
  return openFlags === 0 ? `${through}.` : `${through}, and ${flags}.`;
}

// The flags people set, open ones first; each holds the merge until the
// person who set it resolves it.
const FlagsCondition = ({ pr }: { pr: PullRequestDetail }) => {
  const { threads } = useDiscussion();
  const [shown, setShown] = useState(true);
  const flags = flagsOf(threads);
  if (flags.length === 0) {
    return null;
  }
  const open = flags.filter((t) => !t.root.resolved);
  return (
    <Condition
      icon={open.length === 0 ? <Done /> : <Open />}
      title="Flags"
      detail={`${open.length} open, ${flags.length - open.length} resolved. A flag holds the merge until whoever set it resolves it.`}
      link={
        <Anchor
          component="button"
          fz={12.5}
          fw={500}
          onClick={() => setShown(!shown)}
          style={{ whiteSpace: "nowrap" }}
        >
          {shown ? "Hide flags" : "Show flags"}
        </Anchor>
      }
    >
      {shown && <FlagList pr={pr} flags={flags} />}
    </Condition>
  );
};

const FlagList = ({
  pr,
  flags,
}: {
  pr: PullRequestDetail;
  flags: Thread[];
}) => (
  <Stack gap={10} component="ul" m={0} p={0} style={{ listStyle: "none" }}>
    {flags.map(({ root }) => (
      <Group
        key={root.id}
        component="li"
        gap={8}
        align="flex-start"
        wrap="nowrap"
      >
        <FlagState resolved={!!root.resolved} />
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Anchor
            component={Link}
            to={pullRequestPath(pr, "files", { file: root.path })}
            fz={13}
            fw={500}
            c={palette.ink}
          >
            {flagTitle(root)}
          </Anchor>
          <Text fz={12.5} c={palette.body} lineClamp={2}>
            {root.body}
          </Text>
        </Stack>
      </Group>
    ))}
  </Stack>
);

const FlagState = ({ resolved }: { resolved: boolean }) => (
  <Box
    aria-label={resolved ? "Resolved" : "Open"}
    role="img"
    mt={3}
    w={14}
    h={14}
    c="white"
    style={{
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      ...(resolved
        ? { background: palette.accentFill }
        : { boxShadow: `inset 0 0 0 1.5px ${palette.faint}` }),
    }}
  >
    {resolved && <CheckIcon size={9} />}
  </Box>
);

// "Daniel Park (you) · src/a.ts, line 20 · goes out with your review".
function flagTitle(root: Thread["root"]): string {
  const who = `${root.author?.name ?? "Someone"}${root.mine ? " (you)" : ""}`;
  const where = `${root.path}, ${linesText({ start: root.start!, end: root.end! })}`;
  const state = root.resolved
    ? `resolved by ${root.resolved.by?.name ?? "someone"} after ${root.resolved.commit.slice(0, 7)}`
    : root.status === "draft"
      ? "goes out with your review"
      : null;
  return [who, where, ...(state ? [state] : [])].join(" · ");
}

function flagsOf(threads: Thread[]): Thread[] {
  return threads
    .filter((t) => t.root.kind === "flag")
    .sort((a, b) => Number(!!a.root.resolved) - Number(!!b.root.resolved));
}

// Named reviewers rules still wait on, and high-impact changes no one
// accepted yet.
const RulesCondition = ({
  pr,
  marks,
}: {
  pr: PullRequestDetail;
  marks: Marks;
}) => {
  if (marks.rules.length === 0) {
    return null;
  }
  const waiting = marks.rules.filter(
    (r) =>
      r.action === "require-review" &&
      r.reviewers.length > 0 &&
      !r.reviewers.some((p) => p.done),
  );
  const high = marks.rules
    .filter((r) => r.action === "high-impact")
    .flatMap(ruleChanges)
    .filter((c) => !marks.isAccepted(c)).length;
  const parts = [
    ...waiting.map(
      (r) => `${r.name} waits on ${joinWords(r.reviewers.map((p) => p.name))}.`,
    ),
    ...(high > 0
      ? [
          `${high} high-impact ${high === 1 ? "change is" : "changes are"} not accepted yet.`,
        ]
      : []),
  ];
  const auto = marks.all().filter(marks.isAuto).length;
  return (
    <Condition
      icon={parts.length === 0 ? <Done /> : <Open />}
      title="Rules"
      detail={
        parts.length > 0
          ? parts.join(" ")
          : `${marks.rules.length} ${marks.rules.length === 1 ? "rule" : "rules"} matched, and none waits on anyone.${auto > 0 ? ` ${auto} ${auto === 1 ? "change was" : "changes were"} auto-accepted.` : ""}`
      }
      link={
        <Anchor
          component={Link}
          to={pullRequestPath(pr, "brackets", {
            bracket: ruleGroupId((waiting[0] ?? marks.rules[0])!),
          })}
          fz={12.5}
          fw={500}
          style={{ whiteSpace: "nowrap" }}
        >
          See matched rules
        </Anchor>
      }
    />
  );
};

// Your review in numbers: changes, and the files and brackets you finished.
function reviewOf(pr: PullRequestDetail, marks: Marks) {
  const progress = marks.progress(marks.all());
  return {
    progress,
    left: progress.total - progress.accepted,
    percent: Math.floor((progress.accepted / (progress.total || 1)) * 100),
    files: pr.files.filter((f) => isDone(marks.progress(marks.changes(f.path))))
      .length,
    groups: pr.groups.filter((g) =>
      isDone(marks.progress(rangesChanges(marks, g.ranges))),
    ).length,
  };
}

const Condition = ({
  icon,
  title,
  detail,
  link,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  link?: ReactNode;
  children?: ReactNode;
}) => (
  <Group
    gap={12}
    align="start"
    wrap="nowrap"
    py={12}
    style={{ borderTop: `1px solid ${palette.chip}` }}
  >
    <Group justify="center" w={22} h={22} style={{ flexShrink: 0 }}>
      {icon}
    </Group>
    <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={10} align="baseline">
        <Text fz={14} fw={600}>
          {title}
        </Text>
        <Text fz={13} c={palette.body} style={{ textWrap: "pretty" }}>
          {detail}
        </Text>
        {link && <Box ml="auto">{link}</Box>}
      </Group>
      {children}
    </Stack>
  </Group>
);

const Open = () => (
  <Box
    aria-hidden
    w={22}
    h={22}
    style={{
      borderRadius: "50%",
      background: palette.surface,
      boxShadow: `inset 0 0 0 2px ${palette.pending}`,
    }}
  />
);

const Done = () => (
  <Group
    aria-hidden
    justify="center"
    w={22}
    h={22}
    bg={palette.addedFill}
    c="white"
    style={{ borderRadius: "50%" }}
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.5 8.5 3 3 6-6.5" />
    </svg>
  </Group>
);

const Aside = ({ pr }: { pr: PullRequestDetail }) => (
  <Paper withBorder radius="md" p={16} w={280} style={{ flexShrink: 0 }}>
    <Stack gap={12}>
      <div>
        <Text size="xs" fw={600} c="dimmed" mb={6}>
          Author
        </Text>
        <AuthorLine pr={pr} />
      </div>
      <Divider />
      <Reviewers />
      <Fact label="Into">
        <Code>{pr.targetBranch}</Code>
      </Fact>
      <Fact label="Branch">
        <Code>{pr.branch}</Code>
      </Fact>
      <Fact label="Head">
        <Code>{pr.headCommit.slice(0, 12)}</Code>
      </Fact>
      <Fact label="Size">{pr.files.length} files</Fact>
      <Fact label="Opened">{timeAgo(pr.createdAt)}</Fact>
      <CommentsFact />
    </Stack>
  </Paper>
);

// Each person's latest verdict.
const Reviewers = () => {
  const { activity } = useDiscussion();
  const latest = new Map(
    (activity?.reviews ?? []).map((r) => [r.author?.id ?? r.id, r]),
  );
  if (latest.size === 0) {
    return null;
  }
  return (
    <>
      <div>
        <Text size="xs" fw={600} c="dimmed" mb={6}>
          Reviewers
        </Text>
        <Stack gap={6}>
          {[...latest.values()].map((review) => (
            <Group key={review.id} gap={8} wrap="nowrap" fz={13}>
              <Avatar name={review.author?.name ?? "?"} />
              <Text span inherit truncate>
                {review.author?.name ?? "Someone"}
              </Text>
              <Text
                span
                fz={12}
                fw={600}
                ml="auto"
                c={
                  review.verdict === "accept"
                    ? palette.successInk
                    : palette.dangerInk
                }
              >
                {review.verdict === "accept" ? "Accepted" : "Changes"}
              </Text>
            </Group>
          ))}
        </Stack>
      </div>
      <Divider />
    </>
  );
};

// "5 · 2 flags, 1 open".
const CommentsFact = () => {
  const { threads } = useDiscussion();
  const flags = flagsOf(threads);
  const open = flags.filter((t) => !t.root.resolved).length;
  const count = threads.reduce((n, t) => n + 1 + t.replies.length, 0);
  return (
    <Fact label="Comments">
      {count}
      {flags.length > 0 &&
        ` · ${flags.length === 1 ? "1 flag" : `${flags.length} flags`}, ${open} open`}
    </Fact>
  );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <Group gap={8} wrap="nowrap">
    <Text size="sm" c="dimmed" w={70}>
      {label}
    </Text>
    <Text size="sm" span>
      {children}
    </Text>
  </Group>
);

function writtenBy(pr: PullRequestDetail): string | null {
  if (pr.origin === "github") {
    return `Opened from GitHub by ${pr.openedBy ?? "someone"}, ${timeAgo(pr.createdAt)}`;
  }
  return pr.agent && `Written by ${pr.agent.name}, ${timeAgo(pr.createdAt)}`;
}
