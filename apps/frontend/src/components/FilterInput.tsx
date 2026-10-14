import { Group } from "@mantine/core";
import { palette } from "@lib/ds";
import { FilterIcon } from "./icons";

// A search box over a list, its label as the placeholder.
export const FilterInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <Group
    component="label"
    gap={8}
    h={32}
    px={10}
    c={palette.muted}
    style={{
      border: `1px solid ${palette.control}`,
      borderRadius: 6,
    }}
  >
    <FilterIcon />
    <input
      type="search"
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={{
        flex: 1,
        minWidth: 0,
        border: 0,
        background: "transparent",
        fontFamily: "inherit",
        fontSize: 12.5,
        color: palette.ink,
        outline: "none",
      }}
    />
  </Group>
);
