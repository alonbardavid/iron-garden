import { useMemo } from "react";
import { palette } from "@lib/ds";
import {
  langOf,
  paintLines,
  TOKEN_COLORS,
  type Piece,
} from "../../../logic/syntax";

// A whole file, numbered, in its syntax colors.
export const CodeLines = ({ path, text }: { path: string; text: string }) => {
  const lines = useMemo(
    () => paintLines(splitLines(text), langOf(path)),
    [path, text],
  );
  return (
    <div
      role="table"
      aria-label={`Contents of ${path}`}
      style={{
        fontFamily: "var(--mantine-font-family-monospace)",
        fontSize: 12.5,
        lineHeight: "20px",
        paddingBlock: 8,
      }}
    >
      {lines.map((pieces, i) => (
        <CodeLine key={i} number={i + 1} pieces={pieces} />
      ))}
    </div>
  );
};

// A file's lines; a final newline ends the last line rather than starting
// another.
export function splitLines(text: string): string[] {
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.slice(0, -1) : lines;
}

const CodeLine = ({ number, pieces }: { number: number; pieces: Piece[] }) => (
  <div
    role="row"
    style={{
      display: "flex",
      minHeight: 20,
      // Lines off screen skip layout, so a long file stays quick to scroll.
      contentVisibility: "auto",
      containIntrinsicSize: "auto 20px",
    }}
  >
    <span
      role="rowheader"
      style={{
        flex: "0 0 56px",
        paddingRight: 16,
        textAlign: "right",
        fontSize: 11.5,
        color: palette.muted,
        userSelect: "none",
      }}
    >
      {number}
    </span>
    <span
      role="cell"
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        paddingRight: 12,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {pieces.map((piece, i) => (
        <span
          key={i}
          style={{
            color: TOKEN_COLORS[piece.token],
            fontStyle: piece.token === "com" ? "italic" : undefined,
          }}
        >
          {piece.text}
        </span>
      ))}
    </span>
  </div>
);
