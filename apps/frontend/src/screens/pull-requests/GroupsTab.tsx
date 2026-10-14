import {
  Box,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { PullRequestDetail, ReviewRule } from "@lib/contract";
import { diffLines } from "@lib/diff";
import { palette } from "@lib/ds";
import board from "../../components/board.module.css";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  ExpandIcon,
  Spinner,
} from "../../components/icons";
import {
  CompareButton,
  GhostButton,
  IconButton,
  LayoutSwitch,
  LeftSidePicker,
  leftSideChoices,
  OutlineButton,
  useComparison,
  type DiffLayout,
} from "./diff/controls";
import { FileDiffBody, FileHeading, referenceTitle } from "./diff/FileDiff";
import {
  CONTEXT_LINES,
  chunkViews,
  initiallyShown,
  partners,
  reveal,
  rangeSlice,
  scopeOf,
  segments,
  type DiffLine,
  type Gap,
  type Opening,
  type Range,
  type Reveal,
  type Span,
} from "./diff/model";
import { statsText } from "./diff/reference";
import { useLineMarks } from "./diff/lineMarks";
import {
  CodeBlock,
  FoldedLines,
  FoldRow,
  GapRow,
  Lines,
  MovedLines,
  ReferenceLines,
  RAIL_OFF,
  RAIL_ON,
  RuleSwatch,
  SplitHeader,
  type FileLines,
} from "./diff/rows";
import {
  ACTION_LABELS,
  actionSummary,
  joinWords,
  matchKind,
  matchSummary,
} from "../../logic/rules";
import { useRepository } from "../repository/RepositoryLayout";
import { langOf } from "../../logic/syntax";
import { ImageDiff, imageSides } from "./diff/ImageDiff";
import { useLineNotes } from "./diff/useLineNotes";
import { useFileDiff } from "./diff/useFileDiff";
import { useReferenceCompare, type Referenced } from "./diff/useReference";
import { generatedFiles } from "./files";
import { Markdown } from "../../components/markdown/Markdown";
import { grouperName, pullRequestPath } from "./paths";
import { AUTO_STRIPES, Bar, HIGH_STRIPES } from "./ProgressBar";
import {
  acceptedText,
  changesWord,
  isDone,
  rangesChanges,
  ruleChanges,
  ruleRanges,
  type ChangeRef,
  type Marks,
  type Progress,
} from "./progress";
import { ruleGroupId, useMarks } from "./review";
import { SkeletonCode } from "../../components/skeletons";

interface ReviewGroup {
  id: string;
  kind: string | null;
  title: string;
  description: string | null;
  ranges: (Range & {
    path: string;
    label: string | null;
    note?: string;
    movedFrom?: Range & { path: string };
    reference?: Range & { path: string };
  })[];
  // Set on a matched rule's group.
  rule: ReviewRule | null;
}

// A bracket's changes and how many of them you accepted.
interface GroupProgress {
  changes: ChangeRef[];
  progress: Progress;
}

// A rule's bracket counts the changes the rule matched; any other bracket, the
// changes in its ranges.
function groupProgress(marks: Marks, group: ReviewGroup) {
  const changes = group.rule
    ? ruleChanges(group.rule)
    : rangesChanges(marks, group.ranges);
  return { changes, progress: marks.progress(changes) };
}

// Review by bracket: the agent's brackets on the left, one card per range of
// the selected bracket on the right.
export const GroupsTab = ({ pr }: { pr: PullRequestDetail }) => {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const generated = useMemo(() => generatedFiles(pr), [pr]);
  const { marks, accept, ruleLink } = useMarks();
  const groups = useMemo(() => reviewGroups(pr, marks), [pr, marks]);
  // Ranges you opened or closed yourself; the rest are open until accepted.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  if (pr.status === "processing") {
    return <ProcessingGroups pr={pr} />;
  }
  const index = Math.max(
    0,
    groups.findIndex((g) => g.id === search.get("bracket")),
  );
  const group = groups[index];
  const next = groups[index + 1];
  const link = (g: ReviewGroup | undefined, file?: string) =>
    pullRequestPath(pr, "brackets", { bracket: g?.id, file });
  const wholeFile = search.get("file");
  return (
    <Group align="start" gap={20} wrap="nowrap">
      <Paper
        component="aside"
        aria-label="Brackets"
        w={300}
        p={6}
        withBorder
        style={{ flexShrink: 0, borderColor: palette.card }}
      >
        {groups.map((g, i) => (
          <Fragment key={g.id}>
            {g.kind === null && i > 0 && (
              <Box h={1} mx={8} my={6} bg={palette.line} aria-hidden />
            )}
            {g.rule && !groups[i - 1]?.rule && (
              <>
                {i > 0 && (
                  <Box h={1} mx={8} my={6} bg={palette.line} aria-hidden />
                )}
                <Text px={8} pt={8} pb={4} fz={12} fw={500} c={palette.muted}>
                  Matched rules
                </Text>
              </>
            )}
            <GroupItem
              group={g}
              progress={marks && groupProgress(marks, g).progress}
              current={g === group}
              to={link(g)}
            />
          </Fragment>
        ))}
      </Paper>
      {group && (
        <Stack gap={14} style={{ flex: 1, minWidth: 0 }}>
          <GroupSummary
            group={group}
            progress={marks && groupProgress(marks, group)}
            onAccept={(changes, accepted) => {
              accept(changes, accepted);
              setOpened({});
            }}
          />
          <div>
            {group.ranges.map((range, i) => {
              const id = `${group.id}:${i}`;
              const changes = marks?.changes(range.path, range);
              const progress = changes && marks?.progress(changes);
              const done = !!progress && progress.total > 0 && isDone(progress);
              return (
                <Step
                  key={id}
                  number={group.kind === "flow" ? i + 1 : null}
                  done={done}
                  last={i === group.ranges.length - 1}
                >
                  <RangeCard
                    pr={pr}
                    range={range}
                    foldAuto={group.rule?.action !== "auto-accept"}
                    ruleLink={(rule) =>
                      rule.id === group.rule?.id ? null : ruleLink(rule)
                    }
                    generated={generated.has(range.path)}
                    wholeFile={link(group, range.path)}
                    open={opened[id] ?? !done}
                    onOpen={(open) =>
                      setOpened((current) => ({ ...current, [id]: open }))
                    }
                    accept={
                      changes &&
                      progress &&
                      progress.total > 0 && {
                        progress,
                        toggle: () => accept(changes, !isDone(progress)),
                      }
                    }
                  />
                </Step>
              );
            })}
          </div>
          {next && (
            <Group justify="flex-end" gap={12}>
              <Text fz={12.5} c={palette.muted}>
                Next bracket
              </Text>
              <OutlineButton height={34} to={link(next)}>
                <Markdown inline>{next.title}</Markdown>
                <ArrowRightIcon />
              </OutlineButton>
            </Group>
          )}
          <Legend />
        </Stack>
      )}
      {wholeFile && (
        <WholeFile
          pr={pr}
          path={wholeFile}
          onClose={() => navigate(link(group))}
          filesLink={pullRequestPath(pr, "files", { file: wholeFile })}
        />
      )}
    </Group>
  );
};

const linesLabel = (r: Range) =>
  r.start === r.end ? `line ${r.start}` : `lines ${r.start}–${r.end}`;

// The agent's brackets, one bracket per rule that matched something, then the
// files no bracket covers as "Not in a bracket".
function reviewGroups(pr: PullRequestDetail, marks?: Marks): ReviewGroup[] {
  const groups: ReviewGroup[] = pr.groups.map((g) => ({
    id: g.id,
    kind: g.kind,
    title: g.title,
    description: g.description,
    ranges: g.ranges.map((r) => ({ ...r, label: linesLabel(r) })),
    rule: null,
  }));
  for (const rule of marks?.rules ?? []) {
    groups.push({
      id: ruleGroupId(rule),
      kind: `Rule · ${ACTION_LABELS[rule.action]}`,
      title: rule.name,
      description: null,
      ranges: ruleRanges(marks!, rule).map((r) => ({
        ...r,
        label: linesLabel(r),
      })),
      rule,
    });
  }
  const covered = new Set(
    pr.groups.flatMap((g) => g.ranges.map((r) => r.path)),
  );
  const rest = pr.files.filter((f) => !covered.has(f.path));
  if (rest.length > 0) {
    groups.push({
      id: "unbracketed",
      kind: null,
      title: "Not in a bracket",
      description: "Files the agent did not put in any bracket.",
      ranges: rest.map((f) => ({
        path: f.path,
        start: 1,
        end: Number.MAX_SAFE_INTEGER,
        label: null,
      })),
      rule: null,
    });
  }
  return groups;
}

function meta(group: ReviewGroup): string {
  const files = new Set(group.ranges.map((r) => r.path)).size;
  const fileCount = `${files} ${files === 1 ? "file" : "files"}`;
  if (group.kind === null) {
    return fileCount;
  }
  if (group.rule) {
    return `${changesWord(ruleChanges(group.rule).length)} · ${fileCount}`;
  }
  const ranges = group.ranges.length;
  return `${ranges} ${ranges === 1 ? "range" : "ranges"} · ${fileCount}`;
}

const GroupItem = ({
  group,
  progress,
  current,
  to,
}: {
  group: ReviewGroup;
  progress?: Progress;
  current: boolean;
  to: string;
}) => (
  <UnstyledButton
    component={Link}
    to={to}
    className={current ? undefined : board.item}
    aria-current={current ? "page" : undefined}
    w="100%"
    p={8}
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 5,
      borderRadius: 6,
      ...(current && {
        background: palette.accentSoft,
        boxShadow: `inset 0 0 0 1px ${palette.accentRing}`,
      }),
    }}
  >
    <Group gap={6} w="100%" wrap="nowrap">
      <Text
        ff="monospace"
        fz={10.5}
        fw={600}
        c={palette.meta}
        tt="uppercase"
        style={{ letterSpacing: "0.02em" }}
      >
        {group.kind ?? "Unbracketed"}
      </Text>
      {group.rule?.action === "require-review" ? (
        <ReviewersStatus rule={group.rule} />
      ) : (
        progress &&
        progress.total > 0 && (
          <Text
            ff="monospace"
            fz={11}
            ml="auto"
            {...(isDone(progress)
              ? { c: palette.accent, fw: 600 }
              : { c: palette.secondary })}
          >
            {isDone(progress)
              ? progress.auto === progress.total
                ? "auto-accepted"
                : "accepted"
              : `${progress.total - progress.accepted} left`}
          </Text>
        )
      )}
    </Group>
    <Text fz={12.5} fw={500} c={palette.ink} style={{ textWrap: "pretty" }}>
      <Markdown inline>{group.title}</Markdown>
    </Text>
    {progress && <Bar progress={progress} height={5} />}
    <Text fz={11.5} c={palette.meta}>
      {meta(group)}
    </Text>
  </UnstyledButton>
);

// Who a require-review rule waits on, or who reviewed it.
const ReviewersStatus = ({ rule }: { rule: ReviewRule }) => {
  const done = rule.reviewers.filter((r) => r.done);
  return (
    <Text
      ff="monospace"
      fz={11}
      ml="auto"
      truncate
      {...(done.length > 0
        ? { c: palette.accent, fw: 600 }
        : { c: palette.warningInk })}
    >
      {done.length > 0
        ? `reviewed by ${done[0]!.name}`
        : `waiting on ${joinWords(rule.reviewers.map((r) => r.name))}`}
    </Text>
  );
};

// What a rule does to the changes in its bracket, and what it matches.
const RuleNote = ({ rule }: { rule: ReviewRule }) => {
  const repository = useRepository();
  const waiting = joinWords(rule.reviewers.map((r) => r.name));
  const done = rule.reviewers.filter((r) => r.done);
  const text =
    rule.action === "auto-accept"
      ? "This rule accepts the changes here for everyone. Undo one to review it yourself; accepting it again makes it your own accept."
      : rule.action === "high-impact"
        ? "This rule marks the changes here as high impact. They stay striped until someone accepts them one at a time, and accepting a selection that includes them asks first."
        : done.length > 0
          ? `${joinWords(done.map((r) => r.name))} accepted every change here, so this rule is satisfied.`
          : `This pull request waits on ${waiting || "a reviewer"} until one of them has accepted every change here.`;
  return (
    <Stack
      gap={6}
      py={10}
      px={12}
      bg={palette.subtle}
      style={{ border: `1px solid ${palette.line}`, borderRadius: 6 }}
    >
      <Group gap={10} wrap="nowrap" align="start">
        <Box pt={3}>
          <RuleSwatch action={rule.action} />
        </Box>
        <Text fz={12.5} c={palette.body}>
          {text}
        </Text>
      </Group>
      <Group gap={12} pl={20}>
        <Text ff="monospace" fz={11.5} c={palette.muted}>
          {matchSummary(rule.match)}
        </Text>
        {rule.ruleId && repository.level === "admin" && (
          <GhostButton
            to={`/r/${repository.name}/settings/rules/${rule.ruleId}`}
          >
            Edit rule
          </GhostButton>
        )}
      </Group>
    </Stack>
  );
};

const GroupSummary = ({
  group,
  progress,
  onAccept,
}: {
  group: ReviewGroup;
  progress?: GroupProgress;
  onAccept: (changes: ChangeRef[], accepted: boolean) => void;
}) => (
  <Paper
    component="section"
    withBorder
    py={16}
    px={18}
    style={{ borderColor: palette.card }}
  >
    <Stack gap={10}>
      <Group gap={8}>
        {group.kind && (
          <Text
            span
            ff="monospace"
            fz={11}
            fw={600}
            c={palette.body}
            h={22}
            px={8}
            tt="capitalize"
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 4,
              background: palette.skeleton,
              border: `1px solid ${palette.card}`,
            }}
          >
            {group.rule ? `Rule · ${matchKind(group.rule.match)}` : group.kind}
          </Text>
        )}
        <Text fz={12} c={palette.meta} ml="auto">
          {meta(group)}
        </Text>
      </Group>
      <Title order={2} fz={18} fw={600} lh={1.3}>
        {group.rule ? group.title : <Markdown inline>{group.title}</Markdown>}
      </Title>
      {group.description && (
        <Text component="div" fz={13} c={palette.body} maw={760}>
          <Markdown>{group.description}</Markdown>
        </Text>
      )}
      {group.rule && (
        <>
          <Text fz={13} c={palette.body}>
            {actionSummary(group.rule)}
          </Text>
          <RuleNote rule={group.rule} />
        </>
      )}
      {progress && progress.progress.total > 0 && (
        <GroupAccept {...progress} onAccept={onAccept} />
      )}
    </Stack>
  </Paper>
);

const GroupAccept = ({
  changes,
  progress,
  onAccept,
}: GroupProgress & {
  onAccept: (changes: ChangeRef[], accepted: boolean) => void;
}) => {
  const { total, accepted } = progress;
  const done = isDone(progress);
  return (
    <Group gap={12} pt={4}>
      <Bar progress={progress} width={220} height={8} />
      <Text fz={12.5} c={palette.body}>
        {progress.auto || progress.high
          ? acceptedText(progress)
          : done
            ? `All ${total} changes accepted`
            : accepted
              ? `${total} changes · ${accepted} accepted`
              : `${total} changes · none accepted yet`}
      </Text>
      <UnstyledButton
        className={done ? board.button : board.primary}
        onClick={() => onAccept(changes, !done)}
        ml="auto"
        h={32}
        px={12}
        fz={13}
        fw={600}
        style={{
          borderRadius: 5,
          ...(done
            ? {
                border: `1px solid ${palette.control}`,
                background: palette.surface,
                color: palette.ink,
              }
            : { background: palette.accentFill, color: "white" }),
        }}
      >
        {done
          ? "Accepted · undo"
          : `Accept bracket (${changesWord(total - accepted)})`}
      </UnstyledButton>
    </Group>
  );
};

// What the bars beside the lines do.
export const Legend = () => (
  <Stack gap={8}>
    <Group gap={8} fz={12} c={palette.muted} wrap="nowrap">
      <Group gap={3} aria-hidden wrap="nowrap" style={{ flexShrink: 0 }}>
        <Box w={6} h={14} bg={RAIL_ON} />
        <Box w={6} h={14} bg={RAIL_OFF} />
      </Group>
      Click the bar to accept a change; a removed line and its replacement count
      once. The box at the top of a block accepts the block; shift-click a bar
      for a range.
    </Group>
    <Group gap={16} fz={12} c={palette.muted}>
      <Group gap={6} wrap="nowrap">
        <Box
          w={10}
          h={10}
          aria-hidden
          style={{ background: AUTO_STRIPES(2) }}
        />
        auto-accepted by a rule
      </Group>
      <Group gap={6} wrap="nowrap">
        <Box
          w={10}
          h={10}
          aria-hidden
          style={{ background: HIGH_STRIPES(2) }}
        />
        high impact, not accepted yet
      </Group>
    </Group>
  </Stack>
);

// A range's place in a flow: its number, and the line on to the next one.
const Step = ({
  number,
  done,
  last,
  children,
}: {
  number: number | null;
  done: boolean;
  last: boolean;
  children: ReactNode;
}) => (
  <Group gap={12} align="stretch" wrap="nowrap">
    {number !== null && (
      <Stack gap={0} align="center" w={28} style={{ flexShrink: 0 }}>
        <Text
          span
          ff="monospace"
          fz={12}
          fw={600}
          w={28}
          h={28}
          mt={6}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            ...(done
              ? { background: palette.accentFill, color: "white" }
              : {
                  background: palette.surface,
                  boxShadow: `inset 0 0 0 1.5px ${palette.faint}`,
                }),
          }}
        >
          {number}
        </Text>
        {!last && (
          <Box w={2} bg={palette.rule} style={{ flex: 1 }} aria-hidden />
        )}
      </Stack>
    )}
    <Box pb={last ? 0 : 14} style={{ flex: 1, minWidth: 0 }}>
      {children}
    </Box>
  </Group>
);

const RangeCard = ({
  pr,
  range,
  foldAuto,
  ruleLink,
  generated,
  wholeFile,
  open,
  onOpen,
  accept,
}: {
  pr: PullRequestDetail;
  range: ReviewGroup["ranges"][number];
  foldAuto: boolean;
  ruleLink: FileLines["ruleLink"];
  generated: boolean;
  wholeFile: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  // Absent until the pull request's changes are loaded.
  accept?: { progress: Progress; toggle: () => void } | false;
}) => {
  const [loaded, setLoaded] = useState(!generated);
  const { layout, setLayout, left, setLeft, comparing, compare } =
    useComparison(
      range.reference ? "reference" : range.movedFrom ? "moved" : "before",
    );
  const { diff, error } = useFileDiff(pr, range.path, loaded);
  const change = pr.files.find((f) => f.path === range.path)?.change;
  const picker = (stats?: string) => (
    <LeftSidePicker
      left={left}
      onChange={setLeft}
      stats={stats}
      choices={leftSideChoices({
        isNew: change === "added",
        movedFrom: range.movedFrom,
        reference: range.reference,
        namedBy: pr.agent?.name ?? null,
      })}
    />
  );
  return (
    <Paper
      component="article"
      withBorder
      style={{ overflow: "hidden", borderColor: palette.card }}
    >
      <Group
        gap={10}
        mih={40}
        py={4}
        pr={8}
        pl={12}
        wrap="nowrap"
        style={
          open || range.note
            ? { borderBottom: `1px solid ${palette.line}` }
            : undefined
        }
      >
        <Box ml={-4}>
          <IconButton
            label={open ? "Collapse" : "Expand"}
            onClick={() => onOpen(!open)}
          >
            <ChevronIcon up={open} />
          </IconButton>
        </Box>
        <Text ff="monospace" fz={12.5} truncate>
          {range.path}
        </Text>
        {range.label && (
          <Text fz={11.5} c={palette.meta} style={{ flexShrink: 0 }}>
            {range.label}
          </Text>
        )}
        {range.movedFrom && (
          <Text fz={11.5} c={palette.meta} truncate>
            moved from{" "}
            <Link
              to={pullRequestPath(pr, "files", { file: range.movedFrom.path })}
              style={{ color: palette.secondary }}
            >
              <Text span ff="monospace" fz={11.5}>
                {range.movedFrom.path}
              </Text>
            </Link>
            , {linesLabel(range.movedFrom)}
          </Text>
        )}
        <Box style={{ flex: 1 }} />
        {range.reference && !comparing("reference") && (
          <CompareButton onClick={() => compare("reference")} />
        )}
        <LayoutSwitch layout={layout} onChange={setLayout} />
        <IconButton label="Open the whole file" size={26} to={wholeFile}>
          <ExpandIcon />
        </IconButton>
        {accept && <RangePill {...accept} />}
      </Group>
      {range.note && (
        <Text
          py={8}
          px={12}
          fz={12.5}
          c={accept && isDone(accept.progress) ? palette.muted : palette.body}
          style={{
            textWrap: "pretty",
            ...(open ? { borderBottom: `1px solid ${palette.line}` } : {}),
          }}
        >
          <Markdown inline>{range.note}</Markdown>
        </Text>
      )}
      {open &&
        (!loaded ? (
          <Group gap={12} p={12} fz={12.5} c={palette.secondary}>
            <Text span inherit style={{ flex: 1 }}>
              Generated file. Its diff is hidden.
            </Text>
            <OutlineButton height={28} onClick={() => setLoaded(true)}>
              Load diff
            </OutlineButton>
          </Group>
        ) : error ? (
          <Note color={palette.removed}>{error.message}</Note>
        ) : !diff ? (
          <SkeletonCode lines={8} />
        ) : "reason" in diff ? (
          <Note>{diff.reason}</Note>
        ) : "images" in diff ? (
          <ImageDiff path={range.path} {...imageSides(diff.images)} />
        ) : comparing("moved") && range.movedFrom ? (
          <MovedCompare
            pr={pr}
            path={range.path}
            lines={diff.lines}
            range={range}
            from={range.movedFrom}
            left={picker()}
          />
        ) : (
          <RangeLines
            pr={pr}
            path={range.path}
            lines={diff.lines}
            range={range}
            deleted={change === "deleted"}
            layout={layout}
            withReference={comparing("reference")}
            left={picker}
            wholeFile={wholeFile}
            foldAuto={foldAuto}
            ruleLink={ruleLink}
          />
        ))}
    </Paper>
  );
};

const RangePill = ({
  progress,
  toggle,
}: {
  progress: Progress;
  toggle: () => void;
}) => {
  const done = isDone(progress);
  const some = progress.accepted > 0 && !done;
  return (
    <UnstyledButton
      className={done ? board.primary : board.button}
      role="checkbox"
      aria-checked={done ? true : some ? "mixed" : false}
      onClick={toggle}
      h={24}
      px={10}
      fz={11.5}
      fw={600}
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 12,
        ...(done
          ? {
              border: `1px solid ${palette.accentFill}`,
              background: palette.accentFill,
              color: "white",
            }
          : some
            ? {
                border: `1px solid ${palette.accent}`,
                background: palette.surface,
                color: palette.accent,
              }
            : {
                border: `1px solid ${palette.faint}`,
                background: palette.surface,
                color: palette.ink,
              }),
      }}
    >
      {done && <CheckIcon size={12} />}
      {done
        ? "Accepted"
        : some
          ? `${progress.accepted} of ${progress.total} accepted`
          : "Accept"}
    </UnstyledButton>
  );
};

const Note = ({
  color = palette.secondary,
  children,
}: {
  color?: string;
  children: ReactNode;
}) => (
  <Text p={12} fz={12.5} c={color}>
    {children}
  </Text>
);

// The lines a range covers, with long unchanged stretches folded.
const RangeLines = ({
  pr,
  path,
  lines,
  range,
  deleted,
  layout,
  withReference,
  left,
  wholeFile,
  foldAuto,
  ruleLink,
}: {
  pr: PullRequestDetail;
  path: string;
  lines: DiffLine[];
  range: ReviewGroup["ranges"][number];
  deleted: boolean;
  layout: DiffLayout;
  // Compare the range's copied lines with its reference.
  withReference: boolean;
  // The split header's left side, given what matches the reference.
  left: (stats?: string) => ReactNode;
  wholeFile: string;
  foldAuto: boolean;
  ruleLink: FileLines["ruleLink"];
}) => {
  const marks = useLineMarks(path, lines);
  const painted = useMemo(
    () => ({ lines, lang: langOf(path), partners: partners(lines) }),
    [lines, path],
  );
  const notes = useLineNotes({ pr, path, lines, deleted, marks });
  const file: FileLines = { ...painted, marks, ruleLink, notes };
  const referenced = range.reference ? (range as Referenced) : null;
  const reference = useReferenceCompare(pr, painted, referenced, withReference);
  const Shown = foldAuto ? FoldedLines : Lines;
  const show = (span: Span, key?: number) =>
    withReference && reference.compare ? (
      <ReferenceLines
        key={key}
        file={file}
        span={span}
        compare={reference.compare}
        title={referenceTitle(referenced!, pr)}
      />
    ) : (
      <Shown key={key} file={file} span={span} layout={layout} />
    );
  const slice = useMemo(
    () => rangeSlice(lines, range, deleted),
    [lines, range, deleted],
  );
  const [shown, setShown] = useState(() => {
    const changes = initiallyShown(lines.slice(slice.from, slice.to));
    return changes.some(Boolean) ? changes : changes.map(() => true);
  });
  const [reveals, setReveals] = useState<Reveal[]>([
    { top: 0, bottom: CONTEXT_LINES },
    { top: CONTEXT_LINES, bottom: 0 },
  ]);
  if (slice.to === slice.from) {
    return <Note>These lines are not in the file.</Note>;
  }
  // The rest of the file opens around the range like the gaps in Files.
  const around = chunkViews([slice], lines.length, reveals)[0]!;
  const open = (gap: Gap, how: Opening) =>
    setReveals((current) => reveal(current, gap, how));
  const parts = segments(shown);
  const folded = shown.filter((visible) => !visible).length;
  return (
    <>
      {layout === "split" && (
        <SplitHeader
          left={left(
            withReference
              ? (reference.problem ??
                  (reference.compare && statsText(reference.compare.stats)))
              : undefined,
          )}
        />
      )}
      <CodeBlock>
        {around.gapAbove && (
          <GapRow
            gap={around.gapAbove}
            onOpen={open}
            what="more"
            scope={scopeOf(
              lines,
              around.before.from,
              around.gapAbove.to - around.gapAbove.bottom,
            )}
          />
        )}
        {show(around.before)}
        {parts.map((part) =>
          part.kind === "lines" ? (
            show(
              { from: slice.from + part.from, to: slice.from + part.to },
              part.from,
            )
          ) : (
            <FoldRow
              key={part.from}
              count={part.to - part.from}
              onOpen={() =>
                setShown((current) =>
                  current.map(
                    (visible, i) => visible || (i >= part.from && i < part.to),
                  ),
                )
              }
            />
          ),
        )}
        {show(around.after)}
        {around.gapBelow && (
          <GapRow gap={around.gapBelow} onOpen={open} what="more" />
        )}
      </CodeBlock>
      {folded > 0 && (
        <Group
          gap={12}
          h={32}
          pl={134}
          pr={12}
          bg={palette.subtle}
          fz={12}
          c={palette.secondary}
          style={{ borderTop: `1px solid ${palette.line}` }}
        >
          <span>
            {folded} more {folded === 1 ? "line is" : "lines are"} folded in
            this range
          </span>
          <GhostButton to={wholeFile}>Open the whole file</GhostButton>
        </Group>
      )}
    </>
  );
};

// Moved lines beside the lines they came from: only what changed on the way
// is marked. Each line here is accepted as its line in the file's diff.
const MovedCompare = ({
  pr,
  path,
  lines,
  range,
  from,
  left,
}: {
  pr: PullRequestDetail;
  path: string;
  lines: DiffLine[];
  range: Range;
  from: Range & { path: string };
  left: ReactNode;
}) => {
  const source = useFileDiff(pr, from.path);
  const marks = useLineMarks(path, lines);
  // Each new line's index in the file's diff.
  const byNew = useMemo(
    () =>
      new Map(
        lines.flatMap((l, i) => (l.kind === "removed" ? [] : [[l.new, i]])),
      ),
    [lines],
  );
  const compared = useMemo(() => {
    if (!source.diff || !("lines" in source.diff)) {
      return null;
    }
    const slice = (side: DiffLine[], kind: "added" | "removed", r: Range) =>
      side
        .filter((l) => l.kind !== kind)
        .slice(r.start - 1, r.end)
        .map((l) => `${l.text}\n`)
        .join("");
    const diff = diffLines(
      slice(source.diff.lines, "added", from),
      slice(lines, "removed", range),
    ).map((line): DiffLine => {
      switch (line.kind) {
        case "same":
          return {
            ...line,
            old: line.old + from.start - 1,
            new: line.new + range.start - 1,
          };
        case "removed":
          return { ...line, old: line.old + from.start - 1 };
        case "added":
          return { ...line, new: line.new + range.start - 1 };
      }
    });
    return { lines: diff, lang: langOf(path), partners: partners(diff) };
  }, [source.diff, lines, from, range, path]);
  if (source.error) {
    return <Note color={palette.removed}>{source.error.message}</Note>;
  }
  if (source.diff && "reason" in source.diff) {
    return <Note>{source.diff.reason}</Note>;
  }
  if (!compared) {
    return <SkeletonCode lines={8} />;
  }
  const changed = compared.lines.some((l) => l.kind !== "same");
  const file: FileLines = {
    ...compared,
    marks: marks && {
      ...marks,
      owner: compared.lines.map((l) =>
        l.kind === "removed" ? null : (marks.owner[byNew.get(l.new)!] ?? null),
      ),
    },
  };
  return (
    <>
      <SplitHeader left={left} after={path} />
      <CodeBlock>
        <MovedLines file={file} title={`Moved from ${from.path}`} />
      </CodeBlock>
      <Text
        py={8}
        pl={134}
        fz={12}
        c={palette.secondary}
        bg={palette.subtle}
        style={{ borderTop: `1px solid ${palette.line}` }}
      >
        {changed
          ? "Marked lines changed on the way; the rest moved as they were."
          : "Moved as is: no line changed on the way."}
      </Text>
    </>
  );
};

// A whole file over the page, with its gaps expandable as in Files.
const WholeFile = ({
  pr,
  path,
  onClose,
  filesLink,
}: {
  pr: PullRequestDetail;
  path: string;
  onClose: () => void;
  filesLink: string;
}) => {
  const { diff, error } = useFileDiff(pr, path);
  return (
    <Modal
      opened
      onClose={onClose}
      size={1240}
      yOffset={40}
      radius={10}
      padding={0}
      withCloseButton={false}
      aria-label={path}
    >
      <Box pos="sticky" top={0} style={{ zIndex: 1 }}>
        <FileHeading path={path} diff={diff}>
          <OutlineButton to={filesLink}>Open in Files</OutlineButton>
          <IconButton label="Close" size={30} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </FileHeading>
      </Box>
      <FileDiffBody
        pr={pr}
        path={path}
        diff={diff}
        error={error}
        loaded
        onLoad={() => undefined}
      />
    </Modal>
  );
};

const StepIcon = ({
  bg,
  c,
  children,
}: {
  bg: string;
  c: string;
  children: ReactNode;
}) => (
  <Group
    justify="center"
    w={18}
    h={18}
    bg={bg}
    c={c}
    style={{ borderRadius: "50%" }}
    aria-hidden
  >
    {children}
  </Group>
);

const ProcessingGroups = ({ pr }: { pr: PullRequestDetail }) => (
  <Group align="start" gap={20} wrap="nowrap">
    <Paper
      component="aside"
      aria-label="Brackets"
      aria-busy
      w={300}
      p={6}
      withBorder
      style={{ flexShrink: 0, borderColor: palette.card }}
    >
      <Text px={8} pt={8} pb={6} fz={12} c={palette.muted}>
        Brackets appear here once {grouperName(pr).toLowerCase()} sends them.
      </Text>
      {[
        [64, 176],
        [48, 208],
        [72, 150],
        [56, 190],
      ].map(([kind, title]) => (
        <Stack key={kind} gap={7} py={10} px={8} aria-hidden>
          <Box w={kind} h={9} bg={palette.chip} style={{ borderRadius: 4 }} />
          <Box w={title} h={11} bg={palette.line} style={{ borderRadius: 4 }} />
          <Box h={5} bg={palette.skeleton} style={{ borderRadius: 2 }} />
        </Stack>
      ))}
    </Paper>
    <Paper
      component="section"
      withBorder
      pt={56}
      pb={48}
      px={24}
      style={{ flex: 1, borderColor: palette.card }}
    >
      <Stack align="center" gap={12} ta="center">
        <Group
          justify="center"
          w={40}
          h={40}
          bg={palette.warningSoft}
          c={palette.warningInk}
          style={{ borderRadius: "50%" }}
          aria-hidden
        >
          <Spinner size={20} />
        </Group>
        <Title order={2} fz={18} fw={600} lh={1.3}>
          Processing this pull request
        </Title>
        <Text fz={13} c={palette.body} maw={460} style={{ textWrap: "pretty" }}>
          {grouperName(pr)} is splitting the changes in {pr.files.length}{" "}
          {pr.files.length === 1 ? "file" : "files"} into reviewable brackets
          and writing a short explanation for each. This usually takes a few
          minutes.
        </Text>
        <Stack
          component="ol"
          gap={6}
          mt={6}
          py={12}
          px={16}
          fz={12.5}
          c={palette.body}
          bg={palette.subtle}
          aria-label="Processing steps"
          style={{
            listStyle: "none",
            border: `1px solid ${palette.line}`,
            borderRadius: 8,
            textAlign: "left",
          }}
        >
          <Group component="li" gap={8}>
            <StepIcon bg={palette.addedFill} c="white">
              <CheckIcon />
            </StepIcon>
            Read the diff
            <Text span ff="monospace" fz={11.5} c={palette.muted}>
              {pr.files.length} {pr.files.length === 1 ? "file" : "files"}
            </Text>
          </Group>
          <Group component="li" gap={8} c={palette.ink} fw={500}>
            <StepIcon bg={palette.warningSoft} c={palette.warningInk}>
              <Spinner size={11} />
            </StepIcon>
            Bracketing related changes and explaining each bracket
          </Group>
        </Stack>
        <OutlineButton height={34} to={pullRequestPath(pr, "files")}>
          Review by file meanwhile
          <ArrowRightIcon />
        </OutlineButton>
      </Stack>
    </Paper>
  </Group>
);
