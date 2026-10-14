import { UnstyledButton } from "@mantine/core";
import { palette } from "@lib/ds";
import board from "./board.module.css";

// A small row of buttons, one of them pressed: a choice between ways to
// show the same thing.
export const SegmentSwitch = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div
    role="group"
    aria-label={label}
    style={{
      fontFamily: "var(--mantine-font-family)",
      display: "flex",
      flex: "0 0 auto",
      border: `1px solid ${palette.control}`,
      borderRadius: 6,
      overflow: "hidden",
      background: palette.surface,
    }}
  >
    {options.map((option, i) => (
      <UnstyledButton
        key={option.value}
        className={board.segment}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        style={{
          height: 22,
          padding: "0 8px",
          borderLeft: i > 0 ? `1px solid ${palette.control}` : 0,
          fontSize: 11.5,
          lineHeight: "22px",
          ...(value === option.value
            ? { background: palette.line, color: palette.ink, fontWeight: 600 }
            : {
                background: palette.surface,
                color: palette.secondary,
                fontWeight: 500,
              }),
        }}
      >
        {option.label}
      </UnstyledButton>
    ))}
  </div>
);
