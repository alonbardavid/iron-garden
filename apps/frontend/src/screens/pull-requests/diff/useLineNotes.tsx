import { UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { PullRequestDetail } from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../../components/board.module.css";
import { CommentIcon, FlagIcon, PlusIcon } from "../../../components/icons";
import { useToggleSet } from "../../../logic/useToggleSet";
import { useOptionalDiscussion, type Thread } from "../discussion";
import { ComposeCard } from "../notes/ComposeCard";
import { NotesCard } from "../notes/NotesCard";
import type { LineMarks } from "./lineMarks";
import { changesIn, rangeSlice, type DiffLine, type Range } from "./model";
import { clustersOf, lineNumbers, linesText, type Cluster } from "./notes";
import type { LineNotes } from "./rows";

interface ClusterNotes extends Cluster {
  threads: Thread[];
}

// The comments on a file's lines, the comment being written, and which
// cards are open. Undefined outside a pull request's discussion.
export function useLineNotes({
  pr,
  path,
  lines,
  deleted,
  marks,
}: {
  pr: PullRequestDetail;
  path: string;
  lines: DiffLine[];
  deleted: boolean;
  marks?: LineMarks;
}): LineNotes | undefined {
  const clusters = useClusters(path, lines, deleted);
  const cards = useOpenCards();
  const compose = useCompose(lines, deleted);
  if (!clusters) {
    return undefined;
  }
  const acceptLines = marks
    ? (range: Range) =>
        marks.set(
          changesIn(marks.owner, rangeSlice(lines, range, deleted)),
          true,
        )
    : undefined;
  const open = clusters.filter(cards.isOpen);
  return {
    gutter: (indexes) => {
      const cluster = clusters.find((c) => indexes.includes(c.from));
      return cluster ? (
        <ClusterMark
          cluster={cluster}
          open={cards.isOpen(cluster)}
          onClick={() => cards.toggle(cluster.key)}
        />
      ) : (
        <AddComment
          line={compose.lineOf(indexes[0]!)}
          onPress={(e) =>
            compose.press(indexes[0]!, {
              extend: e.shiftKey,
              drag: e.type === "mousedown",
            })
          }
        />
      );
    },
    hover: (indexes) => {
      if (indexes.length > 0) {
        compose.hover(indexes[0]!);
      }
    },
    covered: (index) =>
      compose.covers(index) ||
      open.some((c) => index >= c.from && index < c.to),
    below: (index) => (
      <BelowLine
        pr={pr}
        path={path}
        clusters={open.filter((c) => c.to - 1 === index)}
        compose={compose.endsAt(index) ? compose.range : null}
        onClose={cards.toggle}
        onCloseCompose={compose.cancel}
        onAcceptLines={acceptLines}
      />
    ),
  };
}

// Cards start open; closing one hides it until it is opened again.
function useOpenCards() {
  const [closed, toggle] = useToggleSet();
  return { isOpen: (c: ClusterNotes) => !closed.has(c.key), toggle };
}

// The lines of the comment being written: pressing a line's button starts
// it, dragging over more lines takes them in, and a shift-click stretches it
// to the line clicked. Its card opens only once the drag ends.
function useCompose(lines: DiffLine[], deleted: boolean) {
  const numbers = useMemo(() => lineNumbers(lines, deleted), [lines, deleted]);
  const [range, setRange] = useState<Range | null>(null);
  const drag = useDrag();
  const slice = range && rangeSlice(lines, range, deleted);
  const span = (a: number, b: number) => ({
    start: Math.min(a, b),
    end: Math.max(a, b),
  });
  return {
    range,
    lineOf: (index: number) => numbers[index]!,
    covers: (index: number) =>
      !!slice && index >= slice.from && index < slice.to,
    endsAt: (index: number) =>
      !!slice && drag.anchor === null && slice.to - 1 === index,
    cancel: () => setRange(null),
    press: (
      index: number,
      { extend, drag: dragging }: { extend: boolean; drag: boolean },
    ) => {
      const line = numbers[index]!;
      if (extend && range) {
        setRange(span(Math.min(range.start, line), Math.max(range.end, line)));
        return;
      }
      setRange({ start: line, end: line });
      if (dragging) {
        drag.begin(line);
      }
    },
    hover: (index: number) => {
      if (drag.anchor !== null && numbers[index]) {
        setRange(span(drag.anchor, numbers[index]!));
      }
    },
  };
}

// The line a drag started on, until the mouse button goes up anywhere.
function useDrag() {
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => {
    if (anchor === null) {
      return;
    }
    const end = () => setAnchor(null);
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, [anchor]);
  return { anchor, begin: setAnchor };
}

// The open cards whose lines end on a line, then the comment being written
// when it ends there too.
const BelowLine = ({
  pr,
  path,
  clusters,
  compose,
  onClose,
  onCloseCompose,
  onAcceptLines,
}: {
  pr: PullRequestDetail;
  path: string;
  clusters: ClusterNotes[];
  compose: Range | null;
  onClose: (key: string) => void;
  onCloseCompose: () => void;
  onAcceptLines?: (range: Range) => void;
}) => (
  <>
    {clusters.map((c) => (
      <NotesCard
        key={c.key}
        range={c}
        threads={c.threads}
        onClose={() => onClose(c.key)}
        onAcceptLines={onAcceptLines}
      />
    ))}
    {compose && (
      <ComposeCard
        pr={pr}
        path={path}
        range={compose}
        onClose={onCloseCompose}
        onAcceptLines={onAcceptLines}
      />
    )}
  </>
);

// The file's threads, grouped by the lines they share.
function useClusters(
  path: string,
  lines: DiffLine[],
  deleted: boolean,
): ClusterNotes[] | undefined {
  const threads = useOptionalDiscussion()?.threads;
  return useMemo(() => {
    if (!threads) {
      return undefined;
    }
    const here = threads.filter(
      (t) => t.root.path === path && t.root.start !== null,
    );
    const pinned = here.map((t) => ({
      id: t.root.id,
      start: t.root.start!,
      end: t.root.end!,
    }));
    return clustersOf(pinned, lines, deleted).map((cluster) => ({
      ...cluster,
      threads: here.filter((t) => cluster.ids.includes(t.root.id)),
    }));
  }, [threads, path, lines, deleted]);
}

// The mark on the first line of a card's range: a flag still open or a
// comment, with how many there are.
const ClusterMark = ({
  cluster,
  open,
  onClick,
}: {
  cluster: ClusterNotes;
  open: boolean;
  onClick: () => void;
}) => {
  const flagged = cluster.threads.some(
    (t) => t.root.kind === "flag" && !t.root.resolved,
  );
  const count = cluster.threads.length;
  const label = `${count === 1 ? "1 comment" : `${count} comments`} on ${linesText(cluster)}`;
  return (
    <UnstyledButton
      aria-label={label}
      title={label}
      aria-expanded={open}
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        marginTop: 3,
        color: flagged ? palette.flag : palette.accent,
      }}
    >
      {flagged ? <FlagIcon /> : <CommentIcon />}
      {count > 1 && <CountBadge count={count} />}
    </UnstyledButton>
  );
};

const CountBadge = ({ count }: { count: number }) => (
  <span
    aria-hidden
    style={{
      position: "absolute",
      top: -6,
      right: -7,
      minWidth: 12,
      height: 12,
      padding: "0 2px",
      borderRadius: 6,
      background: palette.neutralFill,
      color: "white",
      fontSize: 8.5,
      fontWeight: 700,
      lineHeight: "12px",
      textAlign: "center",
    }}
  >
    {count}
  </span>
);

// Starts a comment on its line on a press, so a drag from it takes in the
// lines it passes over; a keyboard press starts it too.
const AddComment = ({
  line,
  onPress,
}: {
  line: number;
  onPress: (e: MouseEvent) => void;
}) => (
  <UnstyledButton
    className={board.noteAdd}
    aria-label={`Comment on line ${line}`}
    title={`Comment on line ${line}; drag or shift-click to take in more lines`}
    onMouseDown={(e) => {
      e.preventDefault();
      onPress(e);
    }}
    onClick={(e) => e.detail === 0 && onPress(e)}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 16,
      height: 16,
      marginTop: 2,
      borderRadius: 4,
      background: palette.accentFill,
      color: "white",
    }}
  >
    <PlusIcon size={10} />
  </UnstyledButton>
);
