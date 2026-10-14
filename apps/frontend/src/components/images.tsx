import { Box } from "@mantine/core";
import type { ReactEventHandler } from "react";
import type { PathFile } from "@lib/contract";
import { palette } from "@lib/ds";

export type ImageFile = Extract<PathFile, { kind: "image" }>;

// Images show from data URLs: an <img> never runs an SVG's scripts, and the
// bytes come through the API like any other file.
export const imageSource = (file: ImageFile) =>
  `data:${file.type};base64,${file.base64}`;

export const svgSource = (text: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

// A picture centered on a checkerboard, so its transparent parts show.
export const ImageFrame = ({
  src,
  alt,
  onLoad,
}: {
  src: string;
  alt: string;
  onLoad?: ReactEventHandler<HTMLImageElement>;
}) => (
  <Box
    p={24}
    style={{
      flex: 1,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: `repeating-conic-gradient(${palette.tint} 0% 25%, ${palette.surface} 0% 50%) 50% / 16px 16px`,
    }}
  >
    <img src={src} alt={alt} onLoad={onLoad} style={{ maxWidth: "100%" }} />
  </Box>
);
