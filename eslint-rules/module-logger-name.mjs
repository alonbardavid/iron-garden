import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// `moduleLogger("<package>/<path inside it>")` must name the file it sits in:
// the name is written out because `import.meta.url` is undefined for a module
// inside the bundled Worker. Autofixes, so a moved file is `--fix` away.
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "moduleLogger() must be passed this file's own module name",
    },
    fixable: "code",
    schema: [],
    messages: {
      mismatch:
        'moduleLogger name "{{actual}}" does not match this file; expected "{{expected}}".',
      notALiteral:
        'moduleLogger takes this file\'s own name as a string: "{{expected}}".',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "moduleLogger"
        ) {
          return;
        }
        const expected = moduleNameOf(context.filename);
        if (expected === null) return;

        const argument = node.arguments[0];
        if (!argument) {
          context.report({
            node,
            messageId: "notALiteral",
            data: { expected },
          });
          return;
        }
        const fix = (fixer) =>
          fixer.replaceText(argument, JSON.stringify(expected));
        if (argument.type !== "Literal" || typeof argument.value !== "string") {
          context.report({
            node: argument,
            messageId: "notALiteral",
            data: { expected },
            fix,
          });
          return;
        }
        if (argument.value === expected) return;
        context.report({
          node: argument,
          messageId: "mismatch",
          data: { actual: argument.value, expected },
          fix,
        });
      },
    };
  },
};

// `libs/forge/src/repositories.ts` -> `forge/repositories`.
function moduleNameOf(filename) {
  if (!filename) return null;
  const root = repoRoot(dirname(filename));
  if (root === null) return null;

  const path = relative(root, filename)
    .replace(/\\/g, "/")
    .replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/, "");
  const inWorkspace = path.match(/(?:^|\/)(?:libs|apps)\/(.+)$/);
  const name = inWorkspace
    ? inWorkspace[1]
    : path.split("/").filter(Boolean).slice(-2).join("/");
  return name.replace(/(^|\/)src\//, "$1") || null;
}

// Found from the file, not ESLint's cwd, so the answer is the same wherever
// ESLint was started.
function repoRoot(from) {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export default { rules: { "module-logger-name": rule } };
