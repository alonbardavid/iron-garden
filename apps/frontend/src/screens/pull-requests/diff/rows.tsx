import { UnstyledButton } from "@mantine/core";
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ReviewRule } from "@lib/contract";
import { splitRows } from "@lib/diff";
import { palette } from "@lib/ds";
import board from "../../../components/board.module.css";
import {
  ArrowRightIcon,
  CopyIcon,
  FoldIcon,
  ShowAboveIcon,
  ShowBelowIcon,
} from "../../../components/icons";
import {
  CompareButton,
  GhostButton,
  IconButton,
  LayoutSwitch,
  MOVED_INK,
  MOVED_SOFT,
  REFERENCE_INK,
  REFERENCE_SOFT,
  type DiffLayout,
} from "./controls";
import { AUTO_STRIPES, HIGH_STRIPES } from "../ProgressBar";
import type { LineMarks } from "./lineMarks";
import {
  blocksOf,
  EXPAND_STEP,
  type Block,
  type Change,
  type DiffLine,
  type Gap,
  type Opening,
  type Scope,
  type Span,
} from "./model";
import {
  MATCH_TITLES,
  type CopiedLine,
  type ReferenceCompare,
  type ReferenceLine,
} from "./reference";
import {
  changedSpans,
  paint,
  paintSpans,
  TOKEN_COLORS,
  type Lang,
  type Piece,
} from "../../../logic/syntax";

const KIND = {
  added: {
    sign: "+",
    color: palette.added,
    bg: palette.addedBg,
    number: palette.addedNumber,
    mark: palette.addedMark,
  },
  removed: {
    sign: "−",
    color: palette.removed,
    bg: palette.removedBg,
    number: palette.removedNumber,
    mark: palette.removedMark,
  },
  same: {
    sign: "",
    color: palette.muted,
    bg: palette.surface,
    number: palette.surface,
    mark: "",
  },
} as const;

const EMPTY_SIDE = palette.emptySide;

// The lines moved code came from, beside where it went.
const MOVED_SIDE = {
  bg: palette.movedBg,
  number: palette.movedNumber,
  mark: palette.movedMark,
};

// The reference beside copied lines: greyed, so what differs stands out.
const REFERENCE_SIDE = {
  bg: palette.well,
  number: palette.referenceNumber,
  opacity: 0.58,
};
const RENAMED: CSSProperties = {
  textDecoration: `underline dotted ${REFERENCE_INK}`,
  textUnderlineOffset: 3,
};

// Left of the line numbers: a block's box, a change's bar, then the column
// for comments and traces.
const MARKS_WIDTH = 44;
const NOTE_WIDTH = 18;

export const RAIL_ON = palette.accent;
export const RAIL_OFF = palette.rule;

const sans: CSSProperties = { fontFamily: "var(--mantine-font-family)" };
const mono: CSSProperties = {
  fontFamily: "var(--mantine-font-family-monospace)",
};

const stripe: CSSProperties = {
  background: palette.stripe,
  borderTop: `1px solid ${palette.line}`,
  borderBottom: `1px solid ${palette.line}`,
};

const numberCell: CSSProperties = {
  flex: "0 0 44px",
  paddingRight: 8,
  textAlign: "right",
  fontSize: 11.5,
  color: palette.muted,
  userSelect: "none",
};

const code: CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

// The diff lines of one file, in the mono block every row sits in.
export const CodeBlock = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      fontFamily: "var(--mantine-font-family-monospace)",
      fontSize: 12.5,
      lineHeight: "20px",
    }}
  >
    {children}
  </div>
);

export interface FileLines {
  lines: DiffLine[];
  lang: Lang;
  // The line each changed line replaces or is replaced by.
  partners: (number | null)[];
  marks?: LineMarks;
  // Where a rule's bracket is, for the chip on the lines it matched; null
  // inside that bracket.
  ruleLink?: (rule: ReviewRule) => string | null;
  notes?: LineNotes;
}

// The comments and traces on a file's lines, by diff line index.
export interface LineNotes {
  // The note column of the row showing these lines: the mark of what is
  // pinned there, or a button to comment on the line.
  gutter: (indexes: number[]) => ReactNode;
  // The pointer entered the row showing these lines, as it does in a drag.
  hover: (indexes: number[]) => void;
  // Whether an open card or a comment being written covers a line.
  covered: (index: number) => boolean;
  // What opens under a line: cards, and the comment being written.
  below: (index: number) => ReactNode;
}

export const Lines = ({
  file,
  span,
  layout,
}: {
  file: FileLines;
  span: Span;
  layout: DiffLayout;
}) => {
  if (span.to <= span.from) {
    return null;
  }
  const changeOf = (i: number) => file.marks?.owner[span.from + i] ?? null;
  if (layout === "unified") {
    const changes = file.lines
      .slice(span.from, span.to)
      .map((_, i) => changeOf(i));
    const blocks = blocksOf(changes);
    return (
      <>
        {changes.map((change, i) => (
          <Fragment key={span.from + i}>
            <UnifiedRow
              file={file}
              index={span.from + i}
              chip={<RuleChip file={file} change={change} />}
              marks={
                <>
                  <MarkCells
                    marks={file.marks}
                    change={change}
                    block={blocks[i]!}
                  />
                  <NoteCell file={file} indexes={[span.from + i]} />
                </>
              }
            />
            {file.notes?.below(span.from + i)}
          </Fragment>
        ))}
      </>
    );
  }
  const rows = splitRows(file.lines.slice(span.from, span.to));
  const changes = rows.map(({ left, right }) =>
    left === right ? null : changeOf((right ?? left)!),
  );
  const blocks = blocksOf(changes);
  return (
    <>
      {rows.map(({ left, right }, r) => (
        <Fragment key={left ?? `r${right}`}>
          <div
            className={board.ruled}
            onMouseEnter={() =>
              file.notes?.hover(rowIndexes(span, left, right))
            }
            style={{ display: "flex", minHeight: 20, position: "relative" }}
          >
            <RuleChip file={file} change={changes[r]!} />
            <MarkCells
              marks={file.marks}
              change={changes[r]!}
              block={blocks[r]!}
            />
            <NoteCell file={file} indexes={rowIndexes(span, left, right)} />
            <Side
              file={file}
              index={left === null ? null : span.from + left}
              side="old"
            />
            <span
              style={{
                flex: "0 0 24px",
                background: palette.surface,
                borderLeft: `1px solid ${palette.line}`,
                borderRight: `1px solid ${palette.line}`,
              }}
            />
            <Side
              file={file}
              index={right === null ? null : span.from + right}
              side="new"
            />
          </div>
          <BelowRow file={file} indexes={rowIndexes(span, left, right)} />
        </Fragment>
      ))}
    </>
  );
};

// The diff lines a split row shows, each once.
const rowIndexes = (span: Span, left: number | null, right: number | null) =>
  [...new Set([left, right])].flatMap((i) =>
    i === null ? [] : [span.from + i],
  );

const BelowRow = ({
  file,
  indexes,
}: {
  file: FileLines;
  indexes: number[];
}) => (
  <>
    {indexes.map((i) => (
      <Fragment key={i}>{file.notes?.below(i)}</Fragment>
    ))}
  </>
);

// The column for comments and traces, with a bar beside the lines an open
// card covers.
const NoteCell = ({
  file,
  indexes,
}: {
  file: FileLines;
  indexes: number[];
}) => {
  const notes = file.notes;
  const covered = !!notes && indexes.some(notes.covered);
  return (
    <span
      style={{
        ...sans,
        flex: `0 0 ${NOTE_WIDTH}px`,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        boxShadow: covered
          ? `inset -2px 0 0 ${palette.accentLight}`
          : undefined,
      }}
    >
      {notes && indexes.length > 0 && notes.gutter(indexes)}
    </span>
  );
};

const UnifiedRow = ({
  file,
  index,
  marks,
  chip,
}: {
  file: FileLines;
  index: number;
  marks: ReactNode;
  chip: ReactNode;
}) => {
  const line = file.lines[index]!;
  const kind = KIND[line.kind];
  return (
    <div
      className={board.ruled}
      onMouseEnter={() => file.notes?.hover([index])}
      style={{
        display: "flex",
        minHeight: 20,
        background: kind.bg,
        position: "relative",
      }}
    >
      {chip}
      {marks}
      <span
        style={{ flex: "0 0 88px", display: "flex", background: kind.number }}
      >
        <span style={numberCell}>{line.kind !== "added" && line.old}</span>
        <span style={numberCell}>{line.kind !== "removed" && line.new}</span>
      </span>
      <span
        style={{
          flex: "0 0 20px",
          textAlign: "center",
          color: kind.color,
          userSelect: "none",
        }}
      >
        {kind.sign}
      </span>
      <span
        style={{ ...code, flex: "1 1 auto", minWidth: 0, paddingRight: 12 }}
      >
        <Painted file={file} index={index} />
      </span>
    </div>
  );
};

// A row's box column and its change's bar.
const MarkCells = ({
  marks,
  change,
  block,
}: {
  marks?: LineMarks;
  change: Change | null;
  block: Block | null;
}) => (
  <>
    <span
      style={{
        flex: "0 0 20px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      {marks && block?.head && <BlockBox marks={marks} block={block} />}
      {marks && block && !block.head && (
        <span
          aria-hidden
          style={{
            width: 1,
            alignSelf: "stretch",
            background: palette.divider,
          }}
        />
      )}
    </span>
    {marks && change ? (
      <Rail marks={marks} change={change} />
    ) : (
      <span style={{ flex: "0 0 6px" }} />
    )}
  </>
);

// Shown over a line a rule matched when you point at it, naming the rule
// and leading to its bracket.
const RuleChip = ({
  file,
  change,
}: {
  file: FileLines;
  change: Change | null;
}) => {
  const rule = change && file.marks?.rulesOf(change)[0];
  const to = rule && file.ruleLink?.(rule);
  if (!rule || !to) {
    return null;
  }
  return (
    <UnstyledButton
      component={Link}
      to={to}
      className={board.chip}
      style={{
        ...sans,
        position: "absolute",
        right: 8,
        top: 1,
        zIndex: 1,
        height: 18,
        padding: "0 8px",
        alignItems: "center",
        gap: 6,
        borderRadius: 9,
        border: `1px solid ${palette.control}`,
        background: palette.surface,
        boxShadow: "0 1px 3px rgba(22, 25, 29, 0.12)",
        color: palette.ink,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <RuleSwatch action={rule.action} />
      {rule.name}
    </UnstyledButton>
  );
};

export const RuleSwatch = ({ action }: { action: ReviewRule["action"] }) => (
  <span
    aria-hidden
    style={{
      flex: "0 0 auto",
      width: 10,
      height: 10,
      borderRadius: 2,
      background:
        action === "auto-accept"
          ? AUTO_STRIPES(2)
          : action === "high-impact"
            ? HIGH_STRIPES(2)
            : palette.line,
    }}
  />
);

const Rail = ({ marks, change }: { marks: LineMarks; change: Change }) => {
  const accepted = marks.isAccepted(change);
  const auto = accepted && marks.isAuto(change);
  const high = !accepted && marks.isHigh(change);
  const rule = marks.rulesOf(change)[0];
  const what =
    change.lines.length > 1
      ? "this change (a removed and an added line)"
      : "this change";
  const why = auto
    ? `Auto-accepted by ${rule?.name}. `
    : high
      ? `High impact (${rule?.name}). `
      : "";
  const label = `${why}${accepted ? `Undo accept for ${what}` : `Accept ${what}`}. Shift-click for a range.`;
  return (
    <button
      type="button"
      className={board.rail}
      role="checkbox"
      aria-checked={accepted}
      aria-label={label}
      title={label}
      // Keeps a shift-click from selecting the code it passes over.
      onMouseDown={(e) => e.shiftKey && e.preventDefault()}
      onClick={(e) => marks.click(change, e.shiftKey)}
      style={{
        flex: "0 0 6px",
        alignSelf: "stretch",
        padding: 0,
        border: 0,
        cursor: "pointer",
        background: auto
          ? AUTO_STRIPES(2)
          : high
            ? HIGH_STRIPES(2)
            : accepted
              ? RAIL_ON
              : RAIL_OFF,
      }}
    />
  );
};

const BlockBox = ({ marks, block }: { marks: LineMarks; block: Block }) => {
  const accepted = block.changes.filter(marks.isAccepted).length;
  const all = accepted === block.changes.length;
  const some = accepted > 0 && !all;
  const n = block.changes.length;
  const label = all
    ? `Undo accept for this block (${n} changes)`
    : `Accept this block (${n} changes)`;
  return (
    <button
      type="button"
      className={board.box}
      role="checkbox"
      aria-checked={all ? true : some ? "mixed" : false}
      aria-label={label}
      title={label}
      onClick={() => marks.set(block.changes, !all)}
      style={{
        width: 12,
        height: 12,
        marginTop: 4,
        padding: 0,
        borderRadius: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ...(all
          ? {
              background: palette.accentFill,
              border: `1px solid ${palette.accentFill}`,
            }
          : some
            ? {
                background: palette.surface,
                border: `1px solid ${palette.accent}`,
                boxShadow: `inset 0 0 0 2px ${palette.surface}, inset 0 0 0 6px ${palette.accent}`,
              }
            : {
                background: palette.surface,
                border: `1px solid ${palette.faint}`,
              }),
      }}
    >
      <Tick size={9} visible={all} />
    </button>
  );
};

// The white tick inside a filled checkbox.
export const Tick = ({
  size,
  visible = true,
}: {
  size: number;
  visible?: boolean;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="white"
    strokeWidth={size < 10 ? 2.75 : 2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ visibility: visible ? "visible" : "hidden" }}
  >
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

const Side = ({
  file,
  index,
  side,
}: {
  file: FileLines;
  index: number | null;
  side: "old" | "new";
}) => {
  const line = index === null ? null : file.lines[index]!;
  const kind = line ? KIND[line.kind] : null;
  const number =
    line &&
    (side === "old"
      ? line.kind !== "added" && line.old
      : line.kind !== "removed" && line.new);
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        background: kind?.bg ?? EMPTY_SIDE,
      }}
    >
      <span style={{ ...numberCell, background: kind?.number ?? EMPTY_SIDE }}>
        {number}
      </span>
      <span
        style={{
          flex: "0 0 18px",
          textAlign: "center",
          color: kind?.color,
          userSelect: "none",
        }}
      >
        {kind?.sign}
      </span>
      <span
        style={{ ...code, flex: "1 1 auto", minWidth: 0, paddingRight: 10 }}
      >
        {index !== null && <Painted file={file} index={index} />}
      </span>
    </div>
  );
};

// A line in its syntax colors, with what changed against its partner marked.
const Painted = ({
  file,
  index,
  mark = KIND[file.lines[index]!.kind].mark,
}: {
  file: FileLines;
  index: number;
  mark?: string;
}) => {
  const line = file.lines[index]!;
  const partner = file.partners[index];
  const other =
    partner === null || partner === undefined ? null : file.lines[partner]!;
  const spans =
    other === null
      ? null
      : line.kind === "removed"
        ? changedSpans(line.text, other.text)?.before
        : changedSpans(other.text, line.text)?.after;
  return (
    <>
      {paint(line.text, file.lang, spans ?? undefined).map((piece, i) => (
        <span
          key={i}
          style={{
            color: TOKEN_COLORS[piece.token],
            fontStyle: piece.token === "com" ? "italic" : undefined,
            ...(piece.marked && { background: mark, borderRadius: 2 }),
          }}
        >
          {piece.text}
        </span>
      ))}
    </>
  );
};

export const ChunkHeader = ({
  label,
  layout,
  onLayout,
  accepted,
  onAccept,
  onCompare,
}: {
  label: string;
  layout: DiffLayout;
  onLayout: (layout: DiffLayout) => void;
  // Absent until the pull request's changes are loaded.
  accepted?: boolean;
  onAccept?: () => void;
  // Set when the chunk has a reference it is not compared with.
  onCompare?: () => void;
}) => (
  <div
    style={{
      ...stripe,
      display: "flex",
      alignItems: "center",
      gap: 12,
      minHeight: 30,
      padding: `0 8px 0 ${MARKS_WIDTH + 108}px`,
      color: palette.muted,
      fontSize: 12,
    }}
  >
    <span style={{ flex: "1 1 auto" }}>{label}</span>
    {onCompare && <CompareButton onClick={onCompare} />}
    <LayoutSwitch layout={layout} onChange={onLayout} />
    {onAccept && (
      <span style={{ ...sans, display: "flex" }}>
        <GhostButton onClick={onAccept}>
          {accepted ? "Accepted · undo" : "Accept chunk"}
        </GhostButton>
      </span>
    )}
  </div>
);

export const SplitHeader = ({
  before = "Before",
  after = "After",
  left,
}: {
  before?: string;
  after?: string;
  // Replaces the left side's name, such as a picker of what it shows.
  left?: ReactNode;
}) => (
  <div
    style={{
      ...sans,
      display: "flex",
      minHeight: 30,
      alignItems: "center",
      background: palette.subtle,
      borderBottom: `1px solid ${palette.line}`,
    }}
  >
    <span style={{ flex: `0 0 ${MARKS_WIDTH}px` }} />
    {left ? (
      <span
        style={{
          flex: "1 1 0",
          minWidth: 0,
          paddingLeft: 6,
          display: "flex",
          alignItems: "center",
        }}
      >
        {left}
      </span>
    ) : (
      <SideLabel>{before}</SideLabel>
    )}
    <span style={{ flex: "0 0 24px" }} />
    <SideLabel>{after}</SideLabel>
  </div>
);

const SideLabel = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      flex: "1 1 0",
      paddingLeft: 12,
      fontFamily: "var(--mantine-font-family-monospace)",
      fontSize: 12,
      fontWeight: 500,
      color: palette.ink,
    }}
  >
    {children}
  </span>
);

const GAP_WHERE = { above: " above", between: "", below: " below" } as const;

export const GapRow = ({
  gap,
  onOpen,
  what = "unchanged",
  scope,
}: {
  gap: Gap;
  onOpen: (gap: Gap, how: Opening) => void;
  // The declaration the lines below sit in, when it is folded away here.
  scope?: Scope | null;
  // Lines around a bracket range can hold other changes.
  what?: "unchanged" | "more";
}) => {
  const step = Math.min(EXPAND_STEP, gap.hidden);
  const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;
  return (
    <div
      style={{
        ...sans,
        ...stripe,
        display: "flex",
        alignItems: "center",
        gap: 2,
        minHeight: 28,
        paddingLeft: MARKS_WIDTH + 4,
        color: palette.secondary,
        fontSize: 12,
      }}
    >
      {gap.place !== "above" && (
        <IconButton
          label={`Show the next ${lines(step)}`}
          color={palette.accent}
          onClick={() => onOpen(gap, "down")}
        >
          <ShowBelowIcon />
        </IconButton>
      )}
      {gap.place !== "below" && (
        <IconButton
          label={`Show the ${lines(step)} above`}
          color={palette.accent}
          onClick={() => onOpen(gap, "up")}
        >
          <ShowAboveIcon />
        </IconButton>
      )}
      <span style={{ marginLeft: 10 }}>
        {gap.hidden} {what} {gap.hidden === 1 ? "line" : "lines"}
        {GAP_WHERE[gap.place]}
      </span>
      {scope && gap.place !== "below" && (
        <UnstyledButton
          title={`Show the lines up to ${scope.text}`}
          onClick={() => onOpen(gap, { upTo: scope.line })}
          className={board.ghost}
          style={{
            ...mono,
            minWidth: 0,
            height: 22,
            marginLeft: 12,
            marginRight: 12,
            padding: "0 6px",
            borderRadius: 5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: palette.accent,
            fontSize: 12,
          }}
        >
          {scope.text}
        </UnstyledButton>
      )}
    </div>
  );
};

// A span of lines with each run of auto-accepted changes folded into one
// row that opens like any other fold.
export const FoldedLines = ({
  file,
  span,
  layout,
}: {
  file: FileLines;
  span: Span;
  layout: DiffLayout;
}) => {
  const [open, setOpen] = useState<number[]>([]);
  const marks = file.marks;
  const auto = (i: number) => {
    const change = marks?.owner[i];
    return !!change && marks!.isAuto(change);
  };
  const parts: (Span & { folded: boolean })[] = [];
  for (let i = span.from; i < span.to; i++) {
    const folded = auto(i) && !open.includes(runStart(i, span.from, auto));
    const last = parts[parts.length - 1];
    if (last && last.folded === folded) {
      last.to = i + 1;
    } else {
      parts.push({ from: i, to: i + 1, folded });
    }
  }
  return (
    <>
      {parts.map((part) =>
        part.folded ? (
          <AutoFoldRow
            key={part.from}
            file={file}
            span={part}
            onOpen={() => setOpen((current) => [...current, part.from])}
          />
        ) : (
          <Lines key={part.from} file={file} span={part} layout={layout} />
        ),
      )}
    </>
  );
};

function runStart(i: number, from: number, auto: (i: number) => boolean) {
  let start = i;
  while (start > from && auto(start - 1)) {
    start--;
  }
  return start;
}

const AutoFoldRow = ({
  file,
  span,
  onOpen,
}: {
  file: FileLines;
  span: Span;
  onOpen: () => void;
}) => {
  const count = span.to - span.from;
  const change = file.marks?.owner[span.from];
  const rule = change ? file.marks?.rulesOf(change)[0] : undefined;
  const to = rule && file.ruleLink?.(rule);
  return (
    <div
      style={{
        ...sans,
        display: "flex",
        alignItems: "center",
        minHeight: 26,
        background: palette.stripe,
        borderTop: `1px solid ${palette.line}`,
        borderBottom: `1px solid ${palette.line}`,
        fontSize: 12,
      }}
    >
      <span style={{ flex: "0 0 20px" }} />
      <span
        aria-hidden
        style={{
          flex: "0 0 6px",
          alignSelf: "stretch",
          background: AUTO_STRIPES(2),
        }}
      />
      <span style={{ flex: `0 0 ${NOTE_WIDTH}px` }} />
      <UnstyledButton
        className={board.ghost}
        onClick={onOpen}
        ml={14}
        h={20}
        px={6}
        fz={12}
        fw={500}
        c={palette.accent}
        style={{
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <RuleSwatch action="auto-accept" />
        {count} auto-accepted {count === 1 ? "line" : "lines"}
        <FoldIcon />
      </UnstyledButton>
      {rule && (
        <span style={{ marginLeft: 6, color: palette.muted }}>
          by{" "}
          {to ? (
            <Link to={to} style={{ color: palette.secondary }}>
              {rule.name}
            </Link>
          ) : (
            rule.name
          )}
        </span>
      )}
    </div>
  );
};

// Lines folded inside a bracket range; a click unfolds them.
export const FoldRow = ({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) => (
  <UnstyledButton
    className={board.item}
    onClick={onOpen}
    style={{
      ...sans,
      display: "flex",
      width: "100%",
      minHeight: 28,
      background: palette.panel,
      color: palette.secondary,
      fontSize: 12.5,
    }}
  >
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: MARKS_WIDTH + 102,
      }}
    >
      <FoldIcon />
      {count} more {count === 1 ? "line" : "lines"}
    </span>
  </UnstyledButton>
);

type ReferenceRow =
  | { kind: "pair"; left: number | null; right: number | null }
  | { kind: "copied"; index: number; copied: CopiedLine }
  | { kind: "left-out"; line: ReferenceLine };

// A span in split layout with its copied lines beside the reference they
// came from: the reference greyed on the left, the copy green on the right
// with only what differs marked, and reference lines the copy left out.
// Every other line pairs with the file before, as in Lines.
export const ReferenceLines = ({
  file,
  span,
  compare,
  title,
}: {
  file: FileLines;
  span: Span;
  compare: ReferenceCompare;
  // Names the reference beside its lines.
  title: string;
}) => {
  const rows = referenceRows(file, span, compare);
  const owner = file.marks?.owner;
  const changes = rows.map((row) =>
    row.kind === "copied"
      ? (owner?.[row.index] ?? null)
      : row.kind === "pair" && row.left !== row.right
        ? (owner?.[(row.right ?? row.left)!] ?? null)
        : null,
  );
  const blocks = blocksOf(changes);
  return (
    <>
      {rows.map((row, r) => {
        const linked = row.kind !== "pair";
        const head = linked && (r === 0 || rows[r - 1]!.kind === "pair");
        return (
          <Fragment key={r}>
            <div
              className={board.ruled}
              title={rowTitle(row)}
              onMouseEnter={() => file.notes?.hover(referenceRowIndexes(row))}
              style={{ display: "flex", minHeight: 20, position: "relative" }}
            >
              <RuleChip file={file} change={changes[r]!} />
              <MarkCells
                marks={file.marks}
                change={changes[r]!}
                block={blocks[r]!}
              />
              <NoteCell file={file} indexes={referenceRowIndexes(row)} />
              {row.kind === "pair" ? (
                <Side file={file} index={row.left} side="old" />
              ) : (
                <ReferenceSide
                  file={file}
                  line={row.kind === "copied" ? row.copied.reference : row.line}
                  leftOut={row.kind === "left-out"}
                />
              )}
              <ReferenceGutter
                link={head ? "head" : linked ? "line" : null}
                title={title}
              />
              {row.kind === "pair" ? (
                <Side file={file} index={row.right} side="new" />
              ) : row.kind === "copied" ? (
                <CopiedSide file={file} index={row.index} copied={row.copied} />
              ) : (
                <Side file={file} index={null} side="new" />
              )}
            </div>
            <BelowRow file={file} indexes={referenceRowIndexes(row)} />
          </Fragment>
        );
      })}
    </>
  );
};

// Moved lines beside the lines they came from, in split layout: the origin
// orange on the left, the lines here green on the right, with what changed
// on the way marked. Removed lines are origin lines that did not make it,
// added ones are new here. The marks' owners are by line of `file`.
export const MovedLines = ({
  file,
  title,
}: {
  file: FileLines;
  // Names the origin beside its lines.
  title: string;
}) => {
  const rows = splitRows(file.lines);
  const changes = rows.map(({ right }) =>
    right === null ? null : (file.marks?.owner[right] ?? null),
  );
  const blocks = blocksOf(changes);
  return (
    <>
      {rows.map(({ left, right }, r) => (
        <div
          key={left ?? `r${right}`}
          className={board.ruled}
          style={{ display: "flex", minHeight: 20, position: "relative" }}
        >
          <RuleChip file={file} change={changes[r]!} />
          <MarkCells
            marks={file.marks}
            change={changes[r]!}
            block={blocks[r]!}
          />
          <NoteCell file={file} indexes={[]} />
          <MovedSide file={file} index={left} side="old" />
          <MovedGutter head={r === 0} title={title} />
          <MovedSide file={file} index={right} side="new" />
        </div>
      ))}
    </>
  );
};

const MovedSide = ({
  file,
  index,
  side,
}: {
  file: FileLines;
  index: number | null;
  side: "old" | "new";
}) => {
  if (index === null) {
    return <Side file={file} index={null} side={side} />;
  }
  const line = file.lines[index]!;
  const kind =
    side === "old"
      ? { ...MOVED_SIDE, sign: "", color: palette.muted }
      : KIND.added;
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        background: kind.bg,
      }}
    >
      <span style={{ ...numberCell, background: kind.number }}>
        {side === "old"
          ? line.kind !== "added" && line.old
          : line.kind !== "removed" && line.new}
      </span>
      <span
        style={{
          flex: "0 0 18px",
          textAlign: "center",
          color: kind.color,
          userSelect: "none",
        }}
      >
        {kind.sign}
      </span>
      <span
        style={{ ...code, flex: "1 1 auto", minWidth: 0, paddingRight: 10 }}
      >
        <Painted file={file} index={index} mark={kind.mark} />
      </span>
    </div>
  );
};

// The column between the sides: an arrow on the first row, and a dashed
// line down the rest.
const MovedGutter = ({ head, title }: { head: boolean; title: string }) => (
  <span
    title={title}
    style={{
      flex: "0 0 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: palette.surface,
      borderLeft: `1px solid ${palette.line}`,
      borderRight: `1px solid ${palette.line}`,
    }}
  >
    {head ? (
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: MOVED_SOFT,
          color: MOVED_INK,
        }}
      >
        <ArrowRightIcon size={11} />
      </span>
    ) : (
      <span
        aria-hidden
        style={{
          flex: "1 1 auto",
          width: 0,
          borderLeft: `1px dashed ${palette.movedLine}`,
        }}
      />
    )}
  </span>
);

const referenceRowIndexes = (row: ReferenceRow) =>
  row.kind === "copied"
    ? [row.index]
    : row.kind === "pair"
      ? [...new Set([row.left, row.right])].flatMap((i) =>
          i === null ? [] : [i],
        )
      : [];

function referenceRows(
  file: FileLines,
  span: Span,
  compare: ReferenceCompare,
): ReferenceRow[] {
  const rows: ReferenceRow[] = [];
  let plain: number[] = [];
  const flush = () => {
    const lines = plain.map((i) => file.lines[i]!);
    for (const { left, right } of splitRows(lines)) {
      rows.push({
        kind: "pair",
        left: left === null ? null : plain[left]!,
        right: right === null ? null : plain[right]!,
      });
    }
    plain = [];
  };
  const leaveOut = (lines: ReferenceLine[] | undefined) => {
    for (const line of lines ?? []) {
      rows.push({ kind: "left-out", line });
    }
  };
  for (let i = span.from; i < span.to; i++) {
    const copied = compare.copied.get(i);
    if (!copied) {
      plain.push(i);
      continue;
    }
    flush();
    leaveOut(compare.leftOut.get(i));
    rows.push({ kind: "copied", index: i, copied });
    if (compare.trailing?.after === i) {
      leaveOut(compare.trailing.lines);
    }
  }
  flush();
  return rows;
}

function rowTitle(row: ReferenceRow): string | undefined {
  if (row.kind === "left-out") {
    return `Reference line ${row.line.line}, left out of the copy`;
  }
  if (row.kind === "copied") {
    const what = MATCH_TITLES[row.copied.match];
    return row.copied.reference
      ? `Reference line ${row.copied.reference.line}: ${what}`
      : what.charAt(0).toUpperCase() + what.slice(1);
  }
  return undefined;
}

const ReferenceSide = ({
  file,
  line,
  leftOut,
}: {
  file: FileLines;
  line: ReferenceLine | null;
  leftOut: boolean;
}) => {
  if (!line) {
    return <Side file={file} index={null} side="old" />;
  }
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        background: REFERENCE_SIDE.bg,
      }}
    >
      <span style={{ ...numberCell, background: REFERENCE_SIDE.number }}>
        {line.line}
      </span>
      <span style={{ flex: "0 0 18px" }} />
      <span
        style={{
          ...code,
          flex: "1 1 auto",
          minWidth: 0,
          paddingRight: 10,
          opacity: REFERENCE_SIDE.opacity,
        }}
      >
        <Pieces pieces={paint(line.text, file.lang)} />
      </span>
      {leftOut && (
        <span
          style={{
            ...sans,
            alignSelf: "center",
            marginRight: 8,
            padding: "0 6px",
            borderRadius: 9,
            background: palette.rule,
            color: palette.secondary,
            fontSize: 11,
            fontWeight: 500,
            lineHeight: "16px",
            whiteSpace: "nowrap",
          }}
        >
          left out
        </span>
      )}
    </div>
  );
};

const CopiedSide = ({
  file,
  index,
  copied,
}: {
  file: FileLines;
  index: number;
  copied: CopiedLine;
}) => {
  const line = file.lines[index]!;
  const kind = KIND.added;
  const renamed = copied.match === "rename";
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        background: kind.bg,
      }}
    >
      <span style={{ ...numberCell, background: kind.number }}>
        {line.kind !== "removed" && line.new}
      </span>
      <span
        style={{
          flex: "0 0 18px",
          textAlign: "center",
          color: kind.color,
          userSelect: "none",
        }}
      >
        {kind.sign}
      </span>
      <span
        style={{ ...code, flex: "1 1 auto", minWidth: 0, paddingRight: 10 }}
      >
        <Pieces
          pieces={paintSpans(line.text, file.lang, copied.spans)}
          marked={
            renamed ? RENAMED : { background: kind.mark, borderRadius: 2 }
          }
        />
      </span>
    </div>
  );
};

// The column between the sides: a copy icon where a run of reference rows
// starts, and a dashed line down the rest of it.
const ReferenceGutter = ({
  link,
  title,
}: {
  link: "head" | "line" | null;
  title: string;
}) => (
  <span
    title={link ? title : undefined}
    style={{
      flex: "0 0 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: palette.surface,
      borderLeft: `1px solid ${palette.line}`,
      borderRight: `1px solid ${palette.line}`,
    }}
  >
    {link === "head" && (
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: REFERENCE_SOFT,
          color: REFERENCE_INK,
        }}
      >
        <CopyIcon size={11} />
      </span>
    )}
    {link === "line" && (
      <span
        aria-hidden
        style={{
          flex: "1 1 auto",
          width: 0,
          borderLeft: `1px dashed ${palette.accentLight}`,
        }}
      />
    )}
  </span>
);

const Pieces = ({
  pieces,
  marked,
}: {
  pieces: Piece[];
  marked?: CSSProperties;
}) => (
  <>
    {pieces.map((piece, i) => (
      <span
        key={i}
        style={{
          color: TOKEN_COLORS[piece.token],
          fontStyle: piece.token === "com" ? "italic" : undefined,
          ...(piece.marked && marked),
        }}
      >
        {piece.text}
      </span>
    ))}
  </>
);
