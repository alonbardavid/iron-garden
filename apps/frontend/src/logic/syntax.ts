import { palette } from "@lib/ds";

// Line-at-a-time coloring as the design canvas paints code: a token never
// spans lines. paint sees one line, so a block comment colors only its first;
// paintLines sees a whole file and carries block comments across lines.

export type Lang = "code" | "sql" | "data" | "text";

const LANGS: Record<string, Lang> = {
  ts: "code",
  tsx: "code",
  mts: "code",
  cts: "code",
  js: "code",
  jsx: "code",
  mjs: "code",
  cjs: "code",
  sql: "sql",
  json: "data",
  jsonc: "data",
  yaml: "data",
  yml: "data",
  toml: "data",
};

export function langOf(path: string): Lang {
  const dot = path.lastIndexOf(".");
  return (dot >= 0 && LANGS[path.slice(dot + 1).toLowerCase()]) || "text";
}

type Token = "kw" | "str" | "num" | "com" | "type" | "fn" | "txt";

export const TOKEN_COLORS: Record<Token, string> = {
  kw: palette.syntaxKeyword,
  str: palette.syntaxString,
  num: palette.syntaxNumber,
  com: palette.syntaxComment,
  type: palette.syntaxType,
  fn: palette.syntaxFunction,
  txt: palette.ink,
};

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "var",
  "async",
  "await",
  "return",
  "if",
  "else",
  "new",
  "function",
  "type",
  "interface",
  "true",
  "false",
  "null",
  "undefined",
  "typeof",
  "as",
  "of",
  "for",
  "throw",
  "default",
  "class",
  "extends",
  "describe",
  "it",
  "expect",
]);

interface Lexed {
  tokens: { text: string; token: Token }[];
  // Whether the line ends inside a block comment.
  inComment: boolean;
}

function lex(text: string, lang: Lang, inComment = false): Lexed {
  if (lang === "text") {
    return { tokens: [{ text, token: "txt" }], inComment: false };
  }
  if (inComment) {
    const end = text.indexOf("*/");
    if (end < 0) {
      return { tokens: [{ text, token: "com" }], inComment: true };
    }
    const rest = lex(text.slice(end + 2), lang);
    return {
      tokens: [{ text: text.slice(0, end + 2), token: "com" }, ...rest.tokens],
      inComment: rest.inComment,
    };
  }
  const out: { text: string; token: Token }[] = [];
  let open = false;
  const pattern =
    lang === "sql"
      ? /(--.*$)|('(?:[^'\\]|\\.)*')|(\b\d+\b)|([A-Za-z_]\w*)|(\s+|.)/g
      : lang === "data"
        ? /(#.*$)|("(?:[^"\\]|\\.)*"(?=\s*:)|[A-Za-z_@'][\w./@'-]*(?=\s*:))|("(?:[^"\\]|\\.)*"|'[^']*')|(\b\d+(?:\.\d+)*\b|\btrue\b|\bfalse\b)|(\s+|.)/g
        : /(\/\/.*$|\/\*.*?(?:\*\/|$))|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g;
  for (const m of text.matchAll(pattern)) {
    const word = m[4];
    let token: Token = "txt";
    if (m[1]) {
      token = "com";
      open = isUnclosedBlockComment(m[1]);
    } else if (lang === "data" && m[2]) {
      token = "kw";
    } else if (lang === "data" ? m[3] : m[2]) {
      token = "str";
    } else if (lang === "data" ? m[4] : m[3]) {
      token = "num";
    } else if (lang === "sql" && word) {
      token = /^[A-Z_]+$/.test(word) ? "kw" : "txt";
    } else if (lang === "code" && word) {
      token = KEYWORDS.has(word)
        ? "kw"
        : /^[A-Z]/.test(word)
          ? "type"
          : text.charAt(m.index + word.length) === "("
            ? "fn"
            : "txt";
    }
    out.push({ text: m[0], token });
  }
  return { tokens: out, inComment: open };
}

const isUnclosedBlockComment = (comment: string) =>
  comment.startsWith("/*") && !(comment.length >= 4 && comment.endsWith("*/"));

export interface Piece {
  text: string;
  token: Token;
  marked: boolean;
}

// A line's tokens, with the characters in [from, to) marked.
export function paint(
  text: string,
  lang: Lang,
  mark?: readonly [number, number],
): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  for (const { text: part, token } of lex(text, lang).tokens) {
    const start = at;
    const end = at + part.length;
    at = end;
    const cuts = mark
      ? [start, Math.max(start, mark[0]), Math.min(end, mark[1]), end]
      : [start, end];
    for (let i = 0; i < cuts.length - 1; i++) {
      if (cuts[i + 1]! > cuts[i]!) {
        pieces.push({
          text: part.slice(cuts[i]! - start, cuts[i + 1]! - start),
          token,
          marked: !!mark && cuts[i]! >= mark[0] && cuts[i + 1]! <= mark[1],
        });
      }
    }
  }
  return pieces;
}

// A whole file's lines in their syntax colors.
export function paintLines(lines: string[], lang: Lang): Piece[][] {
  let inComment = false;
  return lines.map((line) => {
    const lexed = lex(line, lang, inComment);
    inComment = lexed.inComment;
    return lexed.tokens.map(({ text, token }) => ({
      text,
      token,
      marked: false,
    }));
  });
}

// A line's tokens with every span in `spans` marked.
export function paintSpans(
  text: string,
  lang: Lang,
  spans: readonly (readonly [number, number])[],
): Piece[] {
  const cuts = [...new Set(spans.flat())].sort((a, b) => a - b);
  const inside = (at: number) => spans.some(([a, b]) => at >= a && at < b);
  const pieces: Piece[] = [];
  let at = 0;
  for (const piece of paint(text, lang)) {
    const start = at;
    const end = at + piece.text.length;
    at = end;
    const bounds = [start, ...cuts.filter((c) => c > start && c < end), end];
    for (let i = 0; i < bounds.length - 1; i++) {
      pieces.push({
        text: text.slice(bounds[i], bounds[i + 1]),
        token: piece.token,
        marked: inside(bounds[i]!),
      });
    }
  }
  return pieces;
}

// What changed between a removed line and the line that replaced it: the
// text between their common start and end, unless that is most of the line.
export function changedSpans(
  before: string,
  after: string,
): { before: [number, number]; after: [number, number] } | null {
  if (before === after) {
    return null;
  }
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start++;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  if (
    Math.max(endBefore - start, endAfter - start) >
    Math.max(before.length, after.length) * 0.6
  ) {
    return null;
  }
  return { before: [start, endBefore], after: [start, endAfter] };
}
