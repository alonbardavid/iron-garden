import { test, expect, type Page } from "@playwright/test";
import { signInPage } from "../helpers";
import { REVIEW_FIXTURE } from "../review/fixture";
import { TEST_ADMIN } from "../users";

const repository = REVIEW_FIXTURE.repository;
const overview = `/r/${repository}`;

// A 96×48 PNG: a blue ellipse.
const LOGO =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAYAAADuFn/PAAAAsklEQVR42u3bsQ2AMBADQO/EMOzf0SMkOpgC/IgrvICvSuJkP85LeokSAAAQAAAEAIB2lnV7Lb8HeLPsySj5c+ETQKL0LkYU34WI4rsQUXwXIorvQkT5XYQov4sQ5XcRovwuQpTfRQDwBQBlPocAAAAAAAAAAAAAAIKDGAAIU++CIAy4DYUw4D0AwoAXMQgD3oRBDFhF2AVZxlnG2YZaR1tH+x/gh4wfMgIAgAAAIAA+lRuwMiey/KiKKwAAAABJRU5ErkJggg==";

type File = string | { image: string };

// Three commits, as git storage would give them: main's head, the one before
// it, and dev's head.
const MAIN = "c".repeat(40);
const OLDER = "e".repeat(40);
const DEV = "d".repeat(40);

const MAIN_FILES: Record<string, File> = {
  "README.md": "# Greetings\n\nSays hello. Read [the guide](docs/guide.md).\n",
  "docs/guide.md":
    "# Guide\n\n![Logo](../logo.png)\n\nThe greeting is in [greeting.ts](../src/greeting.ts).\n",
  "icon.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#3357E8"/></svg>\n',
  "logo.png": { image: LOGO },
  "package.json": '{\n  "name": "greetings",\n  "version": "1.0.0"\n}\n',
  "src/greeting.ts":
    '/**\n * Who we greet.\n */\nexport const greeting = "hello";\n\nexport function greet(name: string) {\n  return `${greeting}, ${name}`;\n}\n',
  "src/lib/strings.ts":
    "export const shout = (s: string) => s.toUpperCase();\n",
};

const TREES: Record<string, Record<string, File>> = {
  [MAIN]: MAIN_FILES,
  [OLDER]: { "README.md": "# Greetings\n" },
  [DEV]: { ...MAIN_FILES, "src/farewell.ts": 'export const bye = "bye";\n' },
};

const commit = (hash: string, message: string, parents: string[]) => ({
  hash,
  message,
  author: "Ada",
  committedAt: Date.now() - 3_600_000,
  parents,
});

// Enough of a message to be cut short.
const LONG_BODY = Array.from(
  { length: 16 },
  (_, i) => `Step ${i + 1} of the greeting.`,
).join("\n\n");

const HISTORIES: Record<string, ReturnType<typeof commit>[]> = {
  main: [
    commit(MAIN, `Add the greeting\n\nWith a guide.\n\n${LONG_BODY}`, [OLDER]),
    commit(OLDER, "First commit", []),
  ],
  dev: [commit(DEV, "Say goodbye", [MAIN])],
};

function historyOf(ref: string) {
  const history = HISTORIES[ref];
  if (history) {
    return history;
  }
  const all = Object.values(HISTORIES).flat();
  const at = all.findIndex((c) => c.hash === ref);
  return at < 0 ? [] : all.slice(at);
}

function contentsOf(files: Record<string, File>, path: string) {
  const file = files[path];
  if (typeof file === "string") {
    return { kind: "file", file: { kind: "text", text: file } };
  }
  if (file) {
    return {
      kind: "file",
      file: {
        kind: "image",
        type: "image/png",
        base64: file.image,
        bytes: 235,
      },
    };
  }
  const prefix = path ? `${path}/` : "";
  const entries = new Map<string, "directory" | "file">();
  for (const child of Object.keys(files).filter((p) => p.startsWith(prefix))) {
    const [name, ...rest] = child.slice(prefix.length).split("/");
    entries.set(name!, rest.length > 0 ? "directory" : "file");
  }
  if (entries.size === 0) {
    return null;
  }
  return {
    kind: "directory",
    entries: [...entries]
      .map(([name, type]) => ({ name, type }))
      .sort((a, b) =>
        a.type === b.type
          ? a.name.localeCompare(b.name)
          : a.type === "directory"
            ? -1
            : 1,
      ),
  };
}

// The files a commit changes against its parent, and each one's two sides.
const PARENTS: Record<string, string | null> = {
  [MAIN]: OLDER,
  [OLDER]: null,
  [DEV]: MAIN,
};

const linesOf = (file: File | undefined) =>
  typeof file === "string" ? file.split("\n").length - 1 : 0;

function changesOf(hash: string) {
  const after = TREES[hash]!;
  const parent = PARENTS[hash];
  const before = parent ? TREES[parent]! : {};
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return paths
    .filter((path) => before[path] !== after[path])
    .sort()
    .map((path) => ({
      path,
      change: !before[path] ? "added" : !after[path] ? "deleted" : "modified",
      oldLines: linesOf(before[path]),
      newLines: linesOf(after[path]),
    }));
}

function sideOf(hash: string | null | undefined, path: string) {
  const contents = hash ? contentsOf(TREES[hash]!, path) : null;
  return contents?.kind === "file" ? contents.file : null;
}

const notFound = {
  status: 404,
  json: {
    defined: false,
    code: "NOT_FOUND",
    status: 404,
    message: "Path not found",
  },
};

// e2e has no git storage: the repository gets a head commit, and its
// branches, history and files are served from the fixtures above.
async function serveRepository(page: Page) {
  const api = `/api/repositories/${repository}`;
  await page.route(`**${api}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, head: MAIN } });
  });
  await page.route(`**${api}/branches`, (route) =>
    route.fulfill({
      json: [
        { name: "main", commit: MAIN, isDefault: true },
        { name: "dev", commit: DEV, isDefault: false },
      ],
    }),
  );
  await page.route(
    (url) => url.pathname === `${api}/commits`,
    (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 30);
      const history = historyOf(url.searchParams.get("ref") ?? "main");
      return route.fulfill({
        json: {
          commits: history.slice(offset, offset + limit),
          hasMore: history.length > offset + limit,
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith(`${api}/commits/`),
    (route) => {
      const url = new URL(route.request().url());
      const [hash, file] = url.pathname
        .slice(`${api}/commits/`.length)
        .split("/");
      const all = Object.values(HISTORIES).flat();
      const commit = all.find((c) => c.hash === hash);
      if (!commit) {
        return route.fulfill(notFound);
      }
      if (!file) {
        return route.fulfill({ json: { commit, files: changesOf(hash!) } });
      }
      const path = url.searchParams.get("path")!;
      return route.fulfill({
        json: {
          path,
          before: sideOf(PARENTS[hash!], path),
          after: sideOf(hash, path),
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === `${api}/files`,
    (route) => {
      const ref = new URL(route.request().url()).searchParams.get("ref");
      const files = TREES[ref ?? ""];
      return files
        ? route.fulfill({
            json: { paths: Object.keys(files).sort(), truncated: false },
          })
        : route.fulfill(notFound);
    },
  );
  await page.route(
    (url) => url.pathname === `${api}/contents`,
    (route) => {
      const url = new URL(route.request().url());
      const files = TREES[url.searchParams.get("ref") ?? ""];
      const contents =
        files && contentsOf(files, url.searchParams.get("path") ?? "");
      return contents
        ? route.fulfill({ json: contents })
        : route.fulfill(notFound);
    },
  );
}

test.beforeEach(async ({ page }) => {
  await serveRepository(page);
  await signInPage(page, TEST_ADMIN.username, TEST_ADMIN.password);
});

test("browses from the root through a folder to a highlighted file", async ({
  page,
}) => {
  await page.goto(overview);
  const files = page.getByRole("list", { name: "Files" });
  await expect(files.getByRole("listitem")).toHaveText([
    "docs",
    "src",
    "icon.svg",
    "logo.png",
    "package.json",
    "README.md",
  ]);
  await expect(
    page.getByRole("heading", { name: "Greetings", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Add the greeting")).toBeVisible();
  const tree = page.getByRole("navigation", { name: "File tree" });
  await expect(tree.getByRole("link", { name: "README.md" })).toBeVisible();

  await files.getByRole("link", { name: "src" }).click();
  await expect(page).toHaveURL(`${overview}?path=src`);
  await expect(files.getByRole("listitem")).toHaveText(["lib", "greeting.ts"]);
  await expect(tree.getByRole("link", { name: "src" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await files.getByRole("link", { name: "greeting.ts" }).click();
  const code = page.getByRole("table", { name: "Contents of src/greeting.ts" });
  await expect(code.getByRole("row")).toHaveCount(8);
  await expect(code.getByRole("row").nth(3)).toContainText(
    'export const greeting = "hello";',
  );
  await expect(page.getByText("8 lines")).toBeVisible();
  // The comment's middle line is colored as a comment; `export` as a keyword.
  await expect(code.getByText("* Who we greet.")).toHaveCSS(
    "color",
    "rgb(106, 115, 124)",
  );
  await expect(
    code.getByRole("row").nth(3).getByText("export", { exact: true }),
  ).toHaveCSS("color", "rgb(163, 33, 90)");

  const path = page.getByRole("navigation", { name: "Path" });
  await path.getByRole("link", { name: repository }).click();
  await expect(page).toHaveURL(overview);
  await expect(files.getByRole("listitem")).toHaveCount(6);
});

test("markdown renders, with its links and images in the repository", async ({
  page,
}) => {
  await page.goto(`${overview}?path=docs/guide.md`);
  const article = page.getByRole("article");
  await expect(
    article.getByRole("heading", { name: "Guide", level: 1 }),
  ).toBeVisible();
  await expect(article.getByRole("img", { name: "Logo" })).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );

  await page.getByRole("button", { name: "Code" }).click();
  await expect(
    page.getByRole("table", { name: "Contents of docs/guide.md" }),
  ).toContainText("![Logo](../logo.png)");
  await page.getByRole("button", { name: "Preview" }).click();

  await article.getByRole("link", { name: "greeting.ts" }).click();
  await expect(page).toHaveURL(`${overview}?path=src/greeting.ts`);
});

test("images show as pictures, and an SVG also as its source", async ({
  page,
}) => {
  await page.goto(`${overview}?path=logo.png`);
  await expect(
    page.getByRole("article").getByRole("img", { name: "logo.png" }),
  ).toBeVisible();

  await page.goto(`${overview}?path=icon.svg`);
  await expect(
    page.getByRole("article").getByRole("img", { name: "icon.svg" }),
  ).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await page.getByRole("button", { name: "Code" }).click();
  await expect(
    page.getByRole("table", { name: "Contents of icon.svg" }),
  ).toContainText("<circle");
});

test("switches branches, keeping the path", async ({ page }) => {
  await page.goto(`${overview}?path=src`);
  await page.getByRole("textbox", { name: "Branch" }).click();
  await page.getByRole("option", { name: "dev" }).click();
  await expect(page).toHaveURL(`${overview}?ref=dev&path=src`);
  await expect(
    page.getByRole("list", { name: "Files" }).getByRole("listitem"),
  ).toHaveText(["lib", "farewell.ts", "greeting.ts"]);
  await expect(page.getByText("Say goodbye")).toBeVisible();

  await page.getByRole("textbox", { name: "Branch" }).click();
  await page.getByRole("option", { name: "main" }).click();
  await expect(page).toHaveURL(`${overview}?path=src`);
});

test("history lists a branch's commits, and each opens the code as it was", async ({
  page,
}) => {
  await page.goto(overview);
  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(`${overview}/commits`);
  const commits = page.getByRole("list", { name: "Commits" });
  await expect(commits.getByRole("listitem")).toHaveCount(2);
  await expect(commits.getByRole("listitem").first()).toContainText(
    "Add the greeting",
  );

  await commits
    .getByRole("link", { name: `Browse the code at ${OLDER.slice(0, 7)}` })
    .click();
  await expect(page).toHaveURL(`${overview}?ref=${OLDER}`);
  await expect(
    page.getByRole("list", { name: "Files" }).getByRole("listitem"),
  ).toHaveText(["README.md"]);
  await expect(page.getByRole("textbox", { name: "Branch" })).toHaveValue(
    OLDER.slice(0, 12),
  );
});

test("a commit shows what it changed, and the code as it left it", async ({
  page,
}) => {
  await page.goto(`${overview}/commits`);
  await page
    .getByRole("list", { name: "Commits" })
    .getByRole("link", { name: "Add the greeting" })
    .click();
  await expect(page).toHaveURL(`${overview}/commits/${MAIN}`);
  await expect(
    page.getByRole("heading", { name: "Add the greeting" }),
  ).toBeVisible();
  const card = page.getByRole("region", { name: "Commit" });
  await expect(card).toContainText("With a guide.");
  await expect(card).toContainText("7 files changed");
  const lastStep = card.getByText("Step 16 of the greeting.");
  await expect(lastStep).not.toBeInViewport();
  await card.getByRole("button", { name: "Show more" }).click();
  await lastStep.scrollIntoViewIfNeeded();
  await expect(lastStep).toBeInViewport();
  await card.getByRole("button", { name: "Show less" }).click();

  const tree = page.getByRole("navigation", { name: "File tree" });
  await expect(tree.getByRole("link")).toHaveCount(7);
  await tree.getByRole("link", { name: "README.md" }).click();
  await expect(page).toHaveURL(`${overview}/commits/${MAIN}?file=README.md`);
  await expect(
    tree.getByRole("link", { name: "README.md" }).getByLabel("Modified"),
  ).toBeVisible();
  const diff = page.getByRole("article");
  await expect(diff).toContainText("+2");
  await expect(diff).toContainText("Says hello.");

  await diff
    .getByRole("link", { name: `View README.md at ${MAIN.slice(0, 7)}` })
    .click();
  await expect(page).toHaveURL(`${overview}?ref=${MAIN}&path=README.md`);
  await expect(
    page.getByRole("heading", { name: "Greetings", level: 1 }),
  ).toBeVisible();

  await page.goBack();
  await card.getByRole("link", { name: OLDER.slice(0, 7) }).click();
  await expect(page).toHaveURL(`${overview}/commits/${OLDER}`);
  await expect(card).toContainText("1 file changed");
  await expect(
    tree.getByRole("link", { name: "README.md" }).getByLabel("Added"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Browse code" }).click();
  await expect(page).toHaveURL(`${overview}?ref=${OLDER}`);
});

test("finds a file anywhere in the branch by its path", async ({ page }) => {
  await page.goto(overview);
  const tree = page.getByRole("navigation", { name: "File tree" });
  await page.getByRole("searchbox", { name: "Go to file" }).fill("STRINGS");
  await expect(tree.getByRole("link")).toHaveText(["strings.ts"]);
  await expect(tree.getByRole("button", { name: "src/lib" })).toBeVisible();
  await tree.getByRole("link", { name: "strings.ts" }).click();
  await expect(page).toHaveURL(`${overview}?path=src/lib/strings.ts`);

  await page.getByRole("searchbox", { name: "Go to file" }).fill("nothing");
  await expect(tree.getByText("No file matches.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Go to file" }).fill("");
  await expect(tree.getByRole("link", { name: "README.md" })).toBeVisible();
});

test("a deep link opens the folders above it", async ({ page }) => {
  await page.goto(`${overview}?path=src/lib/strings.ts`);
  const tree = page.getByRole("navigation", { name: "File tree" });
  await expect(tree.getByRole("link", { name: "strings.ts" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("table", { name: "Contents of src/lib/strings.ts" }),
  ).toContainText("toUpperCase");

  await tree.getByRole("button", { name: "Close src/lib" }).click();
  await expect(tree.getByRole("link", { name: "strings.ts" })).toBeHidden();
});

test("says when a path or a branch is missing", async ({ page }) => {
  await page.goto(`${overview}?path=nowhere.txt`);
  await expect(
    page.getByRole("article").getByText("Path not found"),
  ).toBeVisible();

  await page.goto(`${overview}?ref=gone`);
  await expect(
    page.getByText("There is no branch or commit named gone."),
  ).toBeVisible();
});

test("the clone URL is a click away", async ({ page }) => {
  await page.goto(overview);
  await page.getByRole("button", { name: "Clone" }).click();
  await expect(page.getByLabel("Clone URL")).toHaveValue(
    new RegExp(`/${repository}\\.git$`),
  );
});
