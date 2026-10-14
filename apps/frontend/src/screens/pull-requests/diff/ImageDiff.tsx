import { Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { palette } from "@lib/ds";
import {
  ImageFrame,
  imageSource,
  svgSource,
  type ImageFile,
} from "../../../components/images";
import { formatBytes, formatBytesChange } from "../../../logic/bytes";
import type { DiffLine } from "./model";

export interface ImageSide {
  src: string;
  bytes: number;
}

interface Dimensions {
  width: number;
  height: number;
}

// An image's two versions side by side, and how its size and dimensions
// changed. An added or deleted image has one side.
export const ImageDiff = ({
  path,
  before,
  after,
}: {
  path: string;
  before: ImageSide | null;
  after: ImageSide | null;
}) => {
  const [dimensions, setDimensions] = useState<{
    before?: Dimensions;
    after?: Dimensions;
  }>({});
  const measure =
    (side: "before" | "after") => (e: { currentTarget: HTMLImageElement }) => {
      const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
      setDimensions((current) => ({ ...current, [side]: { width, height } }));
    };
  return (
    <Stack gap={0}>
      <SizeChange before={before} after={after} dimensions={dimensions} />
      <Group grow gap={0} align="stretch" wrap="nowrap">
        {before && (
          <Version
            label="Before"
            color={palette.removed}
            side={before}
            alt={`${path} before`}
            onLoad={measure("before")}
          />
        )}
        {after && (
          <Version
            label="After"
            color={palette.added}
            side={after}
            alt={`${path} after`}
            onLoad={measure("after")}
            divided={!!before}
          />
        )}
      </Group>
    </Stack>
  );
};

// The sides of a changed raster image.
export function imageSides(images: {
  before: ImageFile | null;
  after: ImageFile | null;
}): { before: ImageSide | null; after: ImageSide | null } {
  const side = (file: ImageFile | null) =>
    file && { src: imageSource(file), bytes: file.bytes };
  return { before: side(images.before), after: side(images.after) };
}

// The sides of a changed SVG, rebuilt from its diff lines.
export function svgSides(lines: DiffLine[]): {
  before: ImageSide | null;
  after: ImageSide | null;
} {
  const side = (kept: DiffLine[]) => {
    if (kept.length === 0) {
      return null;
    }
    const text = `${kept.map((line) => line.text).join("\n")}\n`;
    return {
      src: svgSource(text),
      bytes: new TextEncoder().encode(text).length,
    };
  };
  return {
    before: side(lines.filter((line) => line.kind !== "added")),
    after: side(lines.filter((line) => line.kind !== "removed")),
  };
}

const SizeChange = ({
  before,
  after,
  dimensions,
}: {
  before: ImageSide | null;
  after: ImageSide | null;
  dimensions: { before?: Dimensions; after?: Dimensions };
}) => (
  <Group
    gap={16}
    px={16}
    py={8}
    fz={12.5}
    c={palette.secondary}
    style={{ borderBottom: `1px solid ${palette.line}` }}
  >
    <Text inherit aria-label="Size">
      {sizeText(before?.bytes, after?.bytes)}
    </Text>
    {(dimensions.before || dimensions.after) && (
      <Text inherit aria-label="Dimensions">
        {dimensionsText(dimensions.before, dimensions.after)}
      </Text>
    )}
  </Group>
);

function sizeText(before?: number, after?: number): string {
  if (before === undefined || after === undefined) {
    return formatBytes((before ?? after)!);
  }
  return `${formatBytes(before)} → ${formatBytes(after)} (${formatBytesChange(after - before)})`;
}

function dimensionsText(before?: Dimensions, after?: Dimensions): string {
  const text = (d?: Dimensions) => (d ? `${d.width} × ${d.height}` : "…");
  return before && after
    ? `${text(before)} → ${text(after)}`
    : text(before ?? after);
}

const Version = ({
  label,
  color,
  side,
  alt,
  onLoad,
  divided = false,
}: {
  label: string;
  color: string;
  side: ImageSide;
  alt: string;
  onLoad: (e: { currentTarget: HTMLImageElement }) => void;
  divided?: boolean;
}) => (
  <Stack
    gap={0}
    style={{
      minWidth: 0,
      borderLeft: divided ? `1px solid ${palette.line}` : undefined,
    }}
  >
    <Text fz={11.5} fw={600} c={color} px={16} pt={8}>
      {label}
    </Text>
    <ImageFrame src={side.src} alt={alt} onLoad={onLoad} />
  </Stack>
);
