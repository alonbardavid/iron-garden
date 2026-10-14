// Path patterns for rules. Globs are relative to the repository root: `*`
// and `?` stay inside a folder, `**` crosses folders, `{a,b}` is either.
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") {
      source += "[^/]*";
    } else if (c === "?") {
      source += "[^/]";
    } else if (c === "{") {
      source += "(?:";
    } else if (c === "}") {
      source += ")";
    } else if (c === ",") {
      source +=
        glob.slice(0, i).lastIndexOf("{") > glob.slice(0, i).lastIndexOf("}")
          ? "|"
          : ",";
    } else {
      source += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

// A test for paths: any glob, or any regex, matches. Regexes search the
// whole path.
export function pathMatcher(
  patterns: string[],
  syntax: "glob" | "regex" = "glob",
): (path: string) => boolean {
  const tests = patterns.map((p) =>
    syntax === "glob" ? globToRegExp(p) : new RegExp(p),
  );
  return (path) => tests.some((test) => test.test(path));
}

// Why a pattern cannot be used, or null.
export function patternProblem(
  pattern: string,
  syntax: "glob" | "regex",
): string | null {
  try {
    if (syntax === "glob") {
      globToRegExp(pattern);
    } else {
      new RegExp(pattern);
    }
    return null;
  } catch {
    return `${pattern} is not a valid ${syntax === "glob" ? "glob" : "regular expression"}`;
  }
}
