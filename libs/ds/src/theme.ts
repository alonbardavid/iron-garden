import {
  createTheme,
  Switch,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from "@mantine/core";
import { cssVariable, schemes, type PaletteToken } from "./palette";

// The brand: leaf green, the one accent against steel neutrals.
const brand: MantineColorsTuple = [
  "#ECF5E6",
  "#DCEBD3",
  "#BFDDAE",
  "#9DCB88",
  "#7BB35F",
  "#5A9C47",
  "#3D8438",
  "#34722F",
  "#2F6B2A",
  "#1F4A1C",
];

const gray: MantineColorsTuple = [
  "#F4F5F7",
  "#E9ECEF",
  "#E1E5E9",
  "#CDD3D9",
  "#B8C0C8",
  "#A0A8B0",
  "#6A737C",
  "#4F5861",
  "#3D454D",
  "#1F2428",
];

// What Mantine paints in the dark scheme: text from the light end, the body
// (dark.7) and inputs (dark.6) from the palette's dark surfaces.
const dark: MantineColorsTuple = [
  "#E6EAEE",
  "#C3C9CF",
  "#98A1A9",
  "#78818A",
  "#3A424A",
  "#2D333A",
  "#22272C",
  "#171B1F",
  "#0F1215",
  "#0A0D10",
];

const sans =
  "'IBM Plex Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";

export const theme: MantineThemeOverride = createTheme({
  fontFamily: sans,
  fontFamilyMonospace:
    "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  headings: { fontFamily: sans },
  black: schemes.light.ink,
  colors: { brand, gray, dark },
  primaryColor: "brand",
  primaryShade: 6,
  defaultRadius: "md",
  components: {
    Switch: Switch.extend({ defaultProps: { withThumbIndicator: false } }),
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: variablesOf(schemes.light),
  dark: variablesOf(schemes.dark),
});

const variablesOf = (values: Record<PaletteToken, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([token, value]) => [
      cssVariable(token as PaletteToken),
      value,
    ]),
  );
