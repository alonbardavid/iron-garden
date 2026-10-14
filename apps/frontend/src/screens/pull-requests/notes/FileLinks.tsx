import { Anchor } from "@mantine/core";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { Link } from "react-router-dom";
import type { PullRequestDetail } from "@lib/contract";
import { Markdown } from "../../../components/markdown/Markdown";
import { codePath } from "../../repository/code/paths";
import { pullRequestPath } from "../paths";
import {
  changedPathPattern,
  fileRefOf,
  splitChangedPaths,
  type FileRef,
} from "./fileRefs";

// Where the files a pull request's notes name lead: a changed file to its
// diff, any other file to the code the pull request ends at.
export interface FileLinks {
  hrefOf: (text: string) => string | null;
  split: (text: string) => ReturnType<typeof splitChangedPaths>;
  markdown: { plugin: () => (tree: MdNode) => void; components: Components };
}

const cache = new WeakMap<PullRequestDetail, FileLinks>();

export function fileLinksOf(pr: PullRequestDetail): FileLinks {
  let links = cache.get(pr);
  if (!links) {
    links = buildFileLinks(pr);
    cache.set(pr, links);
  }
  return links;
}

// Markdown a person or an agent wrote, with the files it names as links.
export const NoteMarkdown = ({
  pr,
  children,
}: {
  pr: PullRequestDetail;
  children: string;
}) => {
  const { markdown } = fileLinksOf(pr);
  return (
    <Markdown plugins={[markdown.plugin]} components={markdown.components}>
      {children}
    </Markdown>
  );
};

// Plain text with the changed files it names as links.
export const LinkedText = ({
  pr,
  children,
}: {
  pr: PullRequestDetail;
  children: string;
}) => {
  const links = fileLinksOf(pr);
  return links.split(children).map((piece, i) =>
    typeof piece === "string" ? (
      <Fragment key={i}>{piece}</Fragment>
    ) : (
      <FileLink key={i} to={links.hrefOf(piece.path)!}>
        {piece.text}
      </FileLink>
    ),
  );
};

export const FileLink = ({
  to,
  children,
  ...props
}: { to: string; children: ReactNode } & ComponentProps<typeof Anchor>) => (
  <Anchor component={Link} to={to} inherit {...props}>
    {children}
  </Anchor>
);

function buildFileLinks(pr: PullRequestDetail): FileLinks {
  const changed = new Set(pr.files.map((f) => f.path));
  const pattern = changedPathPattern(changed);
  const hrefOfRef = (ref: FileRef) =>
    ref.changed
      ? pullRequestPath(pr, "files", { file: ref.path })
      : codePath(pr.repository, ref.path, pr.headCommit);
  const hrefOf = (text: string) => {
    const ref = fileRefOf(text, changed);
    return ref && hrefOfRef(ref);
  };
  const split = (text: string) => splitChangedPaths(text, pattern, changed);
  return {
    hrefOf,
    split,
    markdown: {
      plugin: () => (tree) => linkFiles(tree, changed, split),
      components: { a: anchorFor(hrefOf) },
    },
  };
}

// A markdown link: one to a file stays in the app, any other opens elsewhere.
function anchorFor(hrefOf: FileLinks["hrefOf"]): Components["a"] {
  return function MarkdownAnchor({ node: _, href, children, ...props }) {
    const to = href && hrefOf(href);
    return to ? (
      <Link to={to}>{children}</Link>
    ) : (
      <a href={href} {...props} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  };
}

// A markdown tree node, as far as linking files reads it.
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

// Turns the code spans that name a file, and the changed files plain text
// names, into links; text already in a link stays as it is.
function linkFiles(
  node: MdNode,
  changed: ReadonlySet<string>,
  split: FileLinks["split"],
) {
  if (!node.children || node.type === "link" || node.type === "linkReference") {
    return;
  }
  node.children = node.children.flatMap((child): MdNode[] => {
    if (child.type === "inlineCode") {
      const ref = fileRefOf(child.value!, changed);
      return ref
        ? [{ type: "link", url: ref.path, children: [child] }]
        : [child];
    }
    if (child.type === "text") {
      return split(child.value!).map((piece) =>
        typeof piece === "string"
          ? { type: "text", value: piece }
          : {
              type: "link",
              url: piece.path,
              children: [{ type: "text", value: piece.text }],
            },
      );
    }
    linkFiles(child, changed, split);
    return [child];
  });
}
