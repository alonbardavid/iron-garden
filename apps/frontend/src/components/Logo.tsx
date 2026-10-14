import { Group, Text } from "@mantine/core";
import { useId } from "react";
import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";
import { palette } from "@lib/ds";

// A leaf drawn from its stem at the origin, pointing up and to the right.
const LEAF = "M0 0C0-5.5 3.5-9 9-9 9-3.5 5.5 0 0 0z";

const Leaf = ({
  at,
  rotate,
  scale,
}: {
  at: [number, number];
  rotate: number;
  scale: number;
}) => (
  <path
    d={LEAF}
    fill={palette.added}
    transform={`translate(${at[0]} ${at[1]}) rotate(${rotate}) scale(${scale})`}
  />
);

// The brand mark: a seedling growing through a steel hex nut. Its art is
// public/favicon.svg too. The nut, the mark's weight, sits at the vertical
// center of the box, so text beside it lines up with the nut and the leaves
// rise above the line; the box is 36 units tall for that.
export const Logo = ({ size = 28 }: { size?: number }) => {
  const gradient = useId();
  return (
    <svg width={size} height={(size * 36) / 32} viewBox="0 2 32 36" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={palette.brandFrom} />
          <stop offset="1" stopColor={palette.brandTo} />
        </linearGradient>
      </defs>
      <path
        d="M16 10.5 24.5 15.4v9.8L16 30.1 7.5 25.2v-9.8z"
        fill={`url(#${gradient})`}
      />
      <circle cx="16" cy="20" r="3.4" fill={palette.surface} />
      <path
        d="M16 20V9"
        stroke={palette.added}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <Leaf at={[16, 9.6]} rotate={25} scale={0.7} />
      <Leaf at={[16, 12.2]} rotate={-115} scale={0.62} />
    </svg>
  );
};

// The mark and the product's name, set as one: the metal in ink, the garden
// in leaf.
export const Wordmark = ({ large = false }: { large?: boolean }) => {
  const [metal, garden] = splitName(PRODUCT_DISPLAY_NAME);
  return (
    <Group gap={large ? 12 : 8} wrap="nowrap" align="center">
      <Logo size={large ? 64 : 36} />
      <Text
        fw={600}
        fz={large ? 30 : 17}
        lts={large ? -0.6 : -0.3}
        c={palette.ink}
        style={{ whiteSpace: "nowrap" }}
      >
        {metal}
        {garden && (
          <Text span inherit c={palette.added}>
            {garden}
          </Text>
        )}
      </Text>
    </Group>
  );
};

// "IronGarden" splits at its second capital; a one-word name stays whole.
function splitName(name: string): [string, string] {
  const at = name.slice(1).search(/[A-Z]/);
  return at === -1 ? [name, ""] : [name.slice(0, at + 1), name.slice(at + 1)];
}
