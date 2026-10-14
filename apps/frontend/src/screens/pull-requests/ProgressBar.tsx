import { Box } from "@mantine/core";
import { palette } from "@lib/ds";
import { percent, type Progress } from "./progress";

// Changes a rule accepted, and high-impact ones no one accepted yet.
export const AUTO_STRIPES = (size: number) =>
  `repeating-linear-gradient(135deg, ${palette.accent} 0 ${size}px, ${palette.accentStripe} ${size}px ${size * 2}px)`;
export const HIGH_STRIPES = (size: number) =>
  `repeating-linear-gradient(135deg, ${palette.neutralStripe} 0 ${size}px, ${palette.dangerStripe} ${size}px ${size * 2}px)`;

// How far through a bracket, file or pull request you are: what you accepted,
// then what rules accepted, then the high-impact changes still waiting.
export const Bar = ({
  progress,
  width = "100%",
  height,
}: {
  progress: Progress;
  width?: number | string;
  height: number;
}) => {
  const share = (n: number) =>
    progress.total === 0 ? 0 : (n / progress.total) * 100;
  const auto = progress.auto ?? 0;
  const stripe = height > 5 ? 3 : 2;
  return (
    <Box
      component="span"
      aria-hidden
      display="flex"
      w={width}
      h={height}
      bg={palette.track}
      style={{
        flexShrink: 0,
        borderRadius: height > 5 ? 3 : 2,
        overflow: "hidden",
      }}
    >
      <Segment
        width={percent(progress) - share(auto)}
        background={palette.accent}
      />
      <Segment width={share(auto)} background={AUTO_STRIPES(stripe)} />
      <Segment
        width={share(progress.high ?? 0)}
        background={HIGH_STRIPES(stripe)}
      />
    </Box>
  );
};

const Segment = ({
  width,
  background,
}: {
  width: number;
  background: string;
}) =>
  width > 0 ? (
    <Box
      component="span"
      display="block"
      h="100%"
      w={`${width.toFixed(1)}%`}
      style={{ background }}
    />
  ) : null;
