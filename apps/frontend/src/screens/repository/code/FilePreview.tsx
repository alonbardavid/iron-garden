import { Box } from "@mantine/core";
import type { ComponentProps } from "react";
import type { Components } from "react-markdown";
import { Link } from "react-router-dom";
import {
  ImageFrame,
  imageSource,
  svgSource,
  type ImageFile,
} from "../../../components/images";
import { Markdown } from "../../../components/markdown/Markdown";
import { useCodeLink } from "./codeRef";
import { parentOf, resolvePath } from "./paths";
import { useRepositoryPath } from "./useRepositoryPath";

export type PreviewKind = "markdown" | "svg";

// Text files that read better rendered than as source.
export function previewOf(path: string): PreviewKind | null {
  if (/\.(md|markdown|mdx)$/i.test(path)) {
    return "markdown";
  }
  return /\.svg$/i.test(path) ? "svg" : null;
}

// A text file rendered: markdown as a document, an SVG as the picture.
export const TextPreview = ({
  path,
  kind,
  text,
}: {
  path: string;
  kind: PreviewKind;
  text: string;
}) =>
  kind === "markdown" ? (
    <Box px={32} py={24}>
      <MarkdownFile path={path} text={text} />
    </Box>
  ) : (
    <ImageFrame src={svgSource(text)} alt={path} />
  );

// A repository's markdown file: its links to other files lead to them in the
// code view, and its images in the repository show. Images from elsewhere
// stay links, as in any markdown here.
export const MarkdownFile = ({
  path,
  text,
}: {
  path: string;
  text: string;
}) => {
  const folder = parentOf(path);
  const components: Components = {
    a: ({ node: _, href, ...props }) => (
      <RepositoryLink folder={folder} href={href} {...props} />
    ),
    img: ({ src, alt }) =>
      typeof src === "string" ? (
        <MarkdownImage folder={folder} src={src} alt={alt ?? ""} />
      ) : null,
  };
  return (
    <Markdown document components={components}>
      {text}
    </Markdown>
  );
};

// A raster image's picture.
export const ImageView = ({ file, alt }: { file: ImageFile; alt: string }) => (
  <ImageFrame src={imageSource(file)} alt={alt} />
);

const RepositoryLink = ({
  folder,
  href,
  ...props
}: ComponentProps<"a"> & { folder: string }) => {
  const linkTo = useCodeLink();
  const target = href ? resolvePath(folder, href) : null;
  if (target === null) {
    const inPage = href?.startsWith("#");
    return (
      <a
        href={href}
        {...props}
        {...(!inPage && { target: "_blank", rel: "noreferrer noopener" })}
      />
    );
  }
  return <Link to={linkTo(target)} {...props} />;
};

const MarkdownImage = ({
  folder,
  src,
  alt,
}: {
  folder: string;
  src: string;
  alt: string;
}) => {
  const target = resolvePath(folder, src);
  if (target === null) {
    return (
      <a href={src} target="_blank" rel="noreferrer noopener">
        {alt || src}
      </a>
    );
  }
  return <RepositoryImage path={target} alt={alt} />;
};

const RepositoryImage = ({ path, alt }: { path: string; alt: string }) => {
  const { contents } = useRepositoryPath(path);
  const file = contents?.kind === "file" ? contents.file : null;
  if (file?.kind === "image") {
    return <img src={imageSource(file)} alt={alt} />;
  }
  if (file?.kind === "text" && previewOf(path) === "svg") {
    return <img src={svgSource(file.text)} alt={alt} />;
  }
  return <span>{alt}</span>;
};
