import type { ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { langOf, paint, TOKEN_COLORS } from "../../logic/syntax";
import styles from "./markdown.module.css";

const markdownPlugins = [remarkGfm];

// What fits in a title: emphasis and code, never a block or a link.
const INLINE = ["p", "strong", "em", "del", "code"];

// Links open elsewhere and images become links unless `components` says
// otherwise.
const block: Components = {
  a: ({ node: _, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener" />
  ),
  // An agent's image would load from wherever it points; link to it instead.
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      <a href={src} target="_blank" rel="noreferrer noopener">
        {alt || src}
      </a>
    ) : null,
  code: ({ node: _, className, children, ...props }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    if (!lang || typeof children !== "string") {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className}>
        {children
          .replace(/\n$/, "")
          .split("\n")
          .map((line, i) => (
            <span key={i}>
              {i > 0 && "\n"}
              {paint(line, langOf(`.${lang}`)).map((piece, j) => (
                <span
                  key={j}
                  style={{
                    color: TOKEN_COLORS[piece.token],
                    fontStyle: piece.token === "com" ? "italic" : undefined,
                  }}
                >
                  {piece.text}
                </span>
              ))}
            </span>
          ))}
      </code>
    );
  },
};

const inline: Components = {
  p: ({ children }) => <>{children}</>,
};

// Text an agent wrote, as GitHub renders it: block markdown for a
// description, `inline` for a title. A `document` (a repository's own
// markdown file) takes the full width and may say how its links and images
// resolve through `components`. `plugins` change block markdown before it
// renders.
export const Markdown = ({
  children,
  inline: isInline = false,
  document = false,
  components,
  plugins = [],
}: {
  children: string;
  inline?: boolean;
  document?: boolean;
  components?: Components;
  plugins?: NonNullable<Options["remarkPlugins"]>;
}): ReactNode =>
  isInline ? (
    <span className={styles.inline}>
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        allowedElements={INLINE}
        unwrapDisallowed
        skipHtml
        components={inline}
      >
        {children}
      </ReactMarkdown>
    </span>
  ) : (
    <div
      className={
        document ? `${styles.markdown} ${styles.document}` : styles.markdown
      }
    >
      <ReactMarkdown
        remarkPlugins={[...markdownPlugins, ...plugins]}
        skipHtml
        components={{ ...block, ...components }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
