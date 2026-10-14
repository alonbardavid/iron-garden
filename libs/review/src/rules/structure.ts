import { changesOf, type DiffLine } from "@lib/diff";
import type { RuleConstruct } from "@lib/db-models";

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

// Code-structure rules read JavaScript and TypeScript only.
export function isScript(path: string): boolean {
  return SCRIPT.test(path);
}

// import and export-from statements, single or multi-line, and require()
// declarations. `import(` and `import.meta` are expressions, not imports.
const IMPORT =
  /^[ \t]*(?:import(?![ \t]*[(.])\b|export[ \t]+(?:type[ \t]+)?(?:\*|\{)[^;]*?\bfrom\b)[^;]*?["'][^"'\n]*["'][ \t]*(?:with[ \t]*\{[^}]*\}[ \t]*)?;?[ \t]*$/gm;
const REQUIRE =
  /^[ \t]*(?:const|let|var)[ \t]+[^=;]+=[ \t]*require\([ \t]*["'][^"'\n]+["'][ \t]*\)[^\n;]*;?[ \t]*$/gm;

// The 1-based lines of `text` that sit wholly inside import statements.
export function importLines(text: string): Set<number> {
  const lines = new Set<number>();
  for (const pattern of [IMPORT, REQUIRE]) {
    for (const match of text.matchAll(pattern)) {
      const first = lineAt(text, match.index);
      const last = first + (match[0].match(/\n/g)?.length ?? 0);
      for (let n = first; n <= last; n++) {
        lines.add(n);
      }
    }
  }
  return lines;
}

// The 1-based lines of `text` that hold a comment and no code. Strings and
// template literals are skipped so a `//` inside one is not a comment.
export function commentLines(text: string): Set<number> {
  const lines = new Set<number>();
  let line = 1;
  let hasComment = false;
  let hasCode = false;
  let state: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  const endLine = () => {
    if (hasComment && !hasCode) {
      lines.add(line);
    }
    line++;
    hasComment = state === "block";
    hasCode = state === "`" || state === "'" || state === '"';
    if (state === "line") {
      state = "code";
    }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\n") {
      endLine();
      continue;
    }
    switch (state) {
      case "code":
        if (c === "/" && text[i + 1] === "/") {
          state = "line";
          hasComment = true;
          i++;
        } else if (c === "/" && text[i + 1] === "*") {
          state = "block";
          hasComment = true;
          i++;
        } else if (c === "'" || c === '"' || c === "`") {
          state = c;
          hasCode = true;
        } else if (c !== " " && c !== "\t" && c !== "\r") {
          hasCode = true;
        }
        break;
      case "block":
        if (c === "*" && text[i + 1] === "/") {
          state = "code";
          i++;
        }
        break;
      case "line":
        break;
      default:
        if (c === "\\") {
          i++;
        } else if (c === state) {
          state = "code";
        }
    }
  }
  if (text.length > 0 && !text.endsWith("\n")) {
    endLine();
  }
  return lines;
}

const FINDERS: Record<RuleConstruct, (text: string) => Set<number>> = {
  imports: importLines,
  comments: commentLines,
};

// The keys of the changes whose every line sits inside one of the
// constructs, on its own side of the diff. A blank line goes with the
// nearest line beside it, so a blank line added with an import matches too.
export function structureMatches(
  lines: DiffLine[],
  before: string,
  after: string,
  constructs: RuleConstruct[],
): string[] {
  const inside = (text: string) => {
    const sets = constructs.map((c) => FINDERS[c](text));
    const rows = text.split("\n");
    const hit = (n: number) => sets.some((set) => set.has(n));
    return (n: number) => {
      if (rows[n - 1]?.trim() !== "") {
        return hit(n);
      }
      const near = (step: number) => {
        let m = n + step;
        while (m >= 1 && m <= rows.length && rows[m - 1]!.trim() === "") {
          m += step;
        }
        return m >= 1 && m <= rows.length && hit(m);
      };
      return near(-1) || near(1);
    };
  };
  const old = inside(before);
  const fresh = inside(after);
  return changesOf(lines)
    .filter((change) =>
      change.lines.every((i) => {
        const line = lines[i]!;
        return line.kind === "removed"
          ? old(line.old)
          : line.kind === "added" && fresh(line.new);
      }),
    )
    .map((change) => change.key);
}

function lineAt(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      n++;
    }
  }
  return n;
}
