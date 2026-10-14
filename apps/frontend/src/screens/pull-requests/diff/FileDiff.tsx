import { Box, Group, Text, UnstyledButton } from "@mantine/core";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { PullRequestDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../../components/board.module.css";
import { Message } from "../../../components/Message";
import { acceptedText, isDone } from "../progress";
import { useMarks } from "../review";
import {
  LeftSidePicker,
  leftSideChoices,
  OutlineButton,
  useComparison,
  type DiffLayout,
} from "./controls";
import { ImageDiff, imageSides, svgSides } from "./ImageDiff";
import { useLineMarks } from "./lineMarks";
import { useLineNotes } from "./useLineNotes";
import {
  changesIn,
  chunkLabel,
  chunksOf,
  chunkViews,
  counts,
  partners,
  rangeSlice,
  reveal,
  type ChunkView,
  type DiffLine,
  type Gap,
  type Opening,
  type Reveal,
  type Span,
  scopeOf,
} from "./model";
import { statsText } from "./reference";
import {
  ChunkHeader,
  CodeBlock,
  FoldedLines,
  GapRow,
  Lines,
  ReferenceLines,
  SplitHeader,
  Tick,
  type FileLines,
} from "./rows";
import { langOf } from "../../../logic/syntax";
import type { FileDiff as Diff } from "./useFileDiff";
import {
  referencedRanges,
  useReferenceCompare,
  type Referenced,
} from "./useReference";
import { SkeletonCode } from "../../../components/skeletons";

// A file's path, how many lines it adds and removes, and how much of it you
// accepted.
export const FileHeading = ({
  path,
  diff,
  children,
}: {
  path: string;
  diff?: Diff;
  children?: ReactNode;
}) => {
  const changed = diff && "lines" in diff ? counts(diff.lines) : null;
  return (
    <Group
      gap={12}
      mih={48}
      py={8}
      pl={16}
      pr={8}
      bg={palette.panel}
      style={{ borderBottom: `1px solid ${palette.control}` }}
    >
      <Text ff="monospace" fz={13.5} fw={500}>
        {path}
      </Text>
      {changed && (
        <Text ff="monospace" fz={12}>
          <Text span inherit c={palette.added}>
            +{changed.added}
          </Text>{" "}
          {changed.removed > 0 && (
            <Text span inherit c={palette.removed}>
              −{changed.removed}
            </Text>
          )}
        </Text>
      )}
      <Box style={{ flex: 1 }} />
      <AcceptFile path={path} />
      {children}
    </Group>
  );
};

const AcceptFile = ({ path }: { path: string }) => {
  const { marks, accept } = useMarks();
  if (!marks) {
    return null;
  }
  const changes = marks.changes(path);
  const progress = marks.progress(changes);
  if (progress.total === 0) {
    return null;
  }
  const done = isDone(progress);
  return (
    <>
      <Text fz={12} c={palette.muted}>
        {acceptedText(progress)}
      </Text>
      <UnstyledButton
        className={board.button}
        role="checkbox"
        aria-checked={done}
        onClick={() => accept(changes, !done)}
        h={30}
        px={10}
        fz={12.5}
        fw={500}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: `1px solid ${palette.control}`,
          borderRadius: 6,
          background: palette.surface,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...(done
              ? {
                  background: palette.accentFill,
                  border: `1px solid ${palette.accentFill}`,
                }
              : {
                  background: palette.surface,
                  border: `1px solid ${palette.faint}`,
                }),
          }}
        >
          <Tick size={10} visible={done} />
        </span>
        {done ? "Accepted" : "Accept"}
      </UnstyledButton>
    </>
  );
};

// A whole file's diff: its chunks, with the unchanged lines between them a
// click away. A generated file waits for `onLoad`. Without a pull request
// there is nothing to accept, comment on or compare.
export const FileDiffBody = ({
  pr,
  path,
  diff,
  error,
  loaded = true,
  onLoad,
  preview = false,
}: {
  pr?: PullRequestDetail;
  path: string;
  diff?: Diff;
  error: Error | null;
  loaded?: boolean;
  onLoad?: () => void;
  // Show a changed SVG as its two pictures rather than its lines.
  preview?: boolean;
}) => {
  if (!loaded) {
    return (
      <Message>
        <span>Generated file. Its diff is hidden.</span>
        <OutlineButton onClick={onLoad}>Load diff</OutlineButton>
      </Message>
    );
  }
  if (error) {
    return <Message color={palette.removed}>{error.message}</Message>;
  }
  if (!diff) {
    return <SkeletonCode lines={10} />;
  }
  if ("reason" in diff) {
    return <Message>{diff.reason}</Message>;
  }
  if ("images" in diff) {
    return <ImageDiff path={path} {...imageSides(diff.images)} />;
  }
  if (diff.lines.length === 0) {
    return <Message>Empty file.</Message>;
  }
  if (preview) {
    return <ImageDiff path={path} {...svgSides(diff.lines)} />;
  }
  return pr ? (
    <Chunks pr={pr} path={path} lines={diff.lines} />
  ) : (
    <PlainChunks path={path} lines={diff.lines} />
  );
};

// Each chunk of a file's diff, drawn by `chunk`, with the unchanged lines
// between them a click away.
const ChunkList = ({
  lines,
  chunk,
}: {
  lines: DiffLine[];
  chunk: (view: ChunkView) => ReactNode;
}) => {
  const chunks = useMemo(() => chunksOf(lines), [lines]);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  if (chunks.length === 0) {
    return <Message>No line changed.</Message>;
  }
  const open = (gap: Gap, how: Opening) =>
    setReveals((current) => reveal(current, gap, how));
  return (
    <CodeBlock>
      {chunkViews(chunks, lines.length, reveals).map((view, c) => (
        <Fragment key={c}>
          {view.gapAbove && (
            <GapRow
              gap={view.gapAbove}
              onOpen={open}
              scope={scopeOf(
                lines,
                view.before.from,
                view.gapAbove.to - view.gapAbove.bottom,
              )}
            />
          )}
          {chunk(view)}
          {view.gapBelow && <GapRow gap={view.gapBelow} onOpen={open} />}
        </Fragment>
      ))}
    </CodeBlock>
  );
};

// A diff with nothing to review: only its lines, each chunk in its own
// layout.
const PlainChunks = ({ path, lines }: { path: string; lines: DiffLine[] }) => {
  const file = useMemo(
    (): FileLines => ({ lines, lang: langOf(path), partners: partners(lines) }),
    [lines, path],
  );
  return (
    <ChunkList
      lines={lines}
      chunk={(view) => <PlainChunk file={file} view={view} />}
    />
  );
};

const PlainChunk = ({ file, view }: { file: FileLines; view: ChunkView }) => {
  const [layout, setLayout] = useState<DiffLayout>("unified");
  return (
    <>
      <Lines file={file} span={view.before} layout={layout} />
      <ChunkHeader
        label={chunkLabel(file.lines.slice(view.chunk.from, view.chunk.to))}
        layout={layout}
        onLayout={setLayout}
      />
      {layout === "split" && <SplitHeader />}
      <Lines file={file} span={view.chunk} layout={layout} />
      <Lines file={file} span={view.after} layout={layout} />
    </>
  );
};

const Chunks = ({
  pr,
  path,
  lines,
}: {
  pr: PullRequestDetail;
  path: string;
  lines: DiffLine[];
}) => {
  const marks = useLineMarks(path, lines);
  const { ruleLink } = useMarks();
  const painted = useMemo(
    () => ({ lines, lang: langOf(path), partners: partners(lines) }),
    [lines, path],
  );
  const notes = useLineNotes({
    pr,
    path,
    lines,
    deleted: pr.files.find((f) => f.path === path)?.change === "deleted",
    marks,
  });
  const file: FileLines = { ...painted, marks, ruleLink, notes };
  const referenced = useMemo(
    () =>
      referencedRanges(pr, path).map((range) => ({
        range,
        slice: rangeSlice(lines, range, false),
      })),
    [pr, path, lines],
  );
  return (
    <ChunkList
      lines={lines}
      chunk={(view) => (
        <Chunk
          pr={pr}
          file={file}
          view={view}
          isNew={pr.files.find((f) => f.path === path)?.change === "added"}
          referenced={
            referenced.find(
              ({ slice }) =>
                slice.from < view.chunk.to && slice.to > view.chunk.from,
            )?.range ?? null
          }
        />
      )}
    />
  );
};

// One chunk with the lines opened around it, in its own layout. A chunk
// whose lines name a reference opens compared with it.
const Chunk = ({
  pr,
  file,
  view,
  isNew,
  referenced,
}: {
  pr: PullRequestDetail;
  file: FileLines;
  view: ChunkView;
  isNew: boolean;
  referenced: Referenced | null;
}) => {
  const { layout, setLayout, left, setLeft, comparing, compare } =
    useComparison(referenced ? "reference" : "before");
  const withReference = comparing("reference");
  const reference = useReferenceCompare(pr, file, referenced, withReference);
  const marks = file.marks;
  const changes = marks ? changesIn(marks.owner, view.chunk) : [];
  const accepted = marks && changes.every(marks.isAccepted);
  const lines = (span: Span) =>
    withReference && reference.compare ? (
      <ReferenceLines
        file={file}
        span={span}
        compare={reference.compare}
        title={referenceTitle(referenced!, pr)}
      />
    ) : span === view.chunk ? (
      <FoldedLines file={file} span={span} layout={layout} />
    ) : (
      <Lines file={file} span={span} layout={layout} />
    );
  return (
    <>
      {lines(view.before)}
      <ChunkHeader
        label={chunkLabel(file.lines.slice(view.chunk.from, view.chunk.to))}
        layout={layout}
        onLayout={setLayout}
        accepted={accepted}
        onAccept={
          marks && changes.length > 0
            ? () => marks.set(changes, !accepted)
            : undefined
        }
        onCompare={
          referenced && !withReference ? () => compare("reference") : undefined
        }
      />
      {layout === "split" && (
        <SplitHeader
          left={
            <LeftSidePicker
              left={left}
              onChange={setLeft}
              choices={leftSideChoices({
                isNew,
                reference: referenced?.reference,
                namedBy: pr.agent?.name ?? null,
              })}
              stats={
                reference.problem ??
                (reference.compare && statsText(reference.compare.stats))
              }
            />
          }
        />
      )}
      {lines(view.chunk)}
      {lines(view.after)}
    </>
  );
};

// What the gutter beside a reference names.
export function referenceTitle(range: Referenced, pr: PullRequestDetail) {
  const by = pr.agent ? `, named by ${pr.agent.name}` : "";
  return `Reference: ${range.reference.path}${by}`;
}
