import { Menu, UnstyledButton } from "@mantine/core";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { palette } from "@lib/ds";
import board from "../../../components/board.module.css";
import { SegmentSwitch } from "../../../components/SegmentSwitch";
import { CheckIcon, ChevronIcon, CopyIcon } from "../../../components/icons";

export type DiffLayout = "unified" | "split";

// What the left side of a split diff shows: the file before the change, the
// lines moved code came from, or the reference copied code came from.
export type LeftSide = "before" | "moved" | "reference";

export const REFERENCE_INK = palette.accentInk;
export const REFERENCE_SOFT = palette.accentTint;
export const MOVED_INK = palette.warningInk;
export const MOVED_SOFT = palette.warningSoft;

// A diff's layout and left side. Lines with a reference or an origin open
// split, compared with it.
export function useComparison(opening: LeftSide) {
  const [layout, setLayout] = useState<DiffLayout>(
    opening === "before" ? "unified" : "split",
  );
  const [left, setLeft] = useState<LeftSide>(opening);
  return {
    layout,
    setLayout,
    left,
    setLeft,
    comparing: (side: LeftSide) => layout === "split" && left === side,
    compare: (side: LeftSide) => {
      setLayout("split");
      setLeft(side);
    },
  };
}

const sans: CSSProperties = { fontFamily: "var(--mantine-font-family)" };

export const OutlineButton = ({
  height = 30,
  to,
  onClick,
  children,
}: {
  height?: number;
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) => (
  <Pressable
    to={to}
    onClick={onClick}
    className={board.button}
    style={{
      ...sans,
      display: "flex",
      alignItems: "center",
      gap: 8,
      height,
      padding: "0 12px",
      border: `1px solid ${palette.control}`,
      borderRadius: 6,
      background: palette.surface,
      color: palette.ink,
      fontSize: height > 30 ? 13 : 12.5,
      fontWeight: 500,
      textDecoration: "none",
    }}
  >
    {children}
  </Pressable>
);

// A link when it has `to`, else a button.
const Pressable = ({
  to,
  onClick,
  label,
  className,
  style,
  children,
}: {
  to?: string;
  onClick?: () => void;
  label?: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) =>
  to ? (
    <UnstyledButton
      component={Link}
      to={to}
      aria-label={label}
      title={label}
      className={className}
      style={style}
    >
      {children}
    </UnstyledButton>
  ) : (
    <UnstyledButton
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
      style={style}
    >
      {children}
    </UnstyledButton>
  );

export const GhostButton = ({
  to,
  onClick,
  children,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) => (
  <Pressable
    to={to}
    onClick={onClick}
    className={board.ghost}
    style={{
      ...sans,
      height: 22,
      padding: "0 6px",
      borderRadius: 5,
      color: palette.accent,
      fontSize: 12,
      fontWeight: 500,
      lineHeight: "22px",
      textDecoration: "none",
    }}
  >
    {children}
  </Pressable>
);

export const IconButton = ({
  label,
  size = 24,
  color = palette.secondary,
  to,
  onClick,
  children,
}: {
  label: string;
  size?: number;
  color?: string;
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) => (
  <Pressable
    to={to}
    onClick={onClick}
    className={board.icon}
    label={label}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: size,
      height: size,
      borderRadius: 5,
      color,
    }}
  >
    {children}
  </Pressable>
);

const LAYOUTS = [
  { value: "unified", label: "Unified" },
  { value: "split", label: "Split" },
] as const;

export const LayoutSwitch = ({
  layout,
  onChange,
}: {
  layout: DiffLayout;
  onChange: (layout: DiffLayout) => void;
}) => (
  <SegmentSwitch
    label="Diff layout"
    options={LAYOUTS}
    value={layout}
    onChange={onChange}
  />
);

export const CompareButton = ({ onClick }: { onClick: () => void }) => (
  <UnstyledButton
    className={board.ghost}
    onClick={onClick}
    title="Show the code this was copied from on the left"
    style={{
      ...sans,
      display: "flex",
      alignItems: "center",
      gap: 6,
      height: 24,
      padding: "0 8px",
      borderRadius: 6,
      color: REFERENCE_INK,
      fontSize: 12,
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}
  >
    <CopyIcon />
    Compare with reference
  </UnstyledButton>
);

export interface LeftSideChoice {
  side: LeftSide;
  label: string;
  sub: string;
  disabled?: boolean;
}

// The left side's name in a split header, opening a menu of what else it
// can show.
export const LeftSidePicker = ({
  left,
  choices,
  onChange,
  stats,
}: {
  left: LeftSide;
  choices: LeftSideChoice[];
  onChange: (side: LeftSide) => void;
  // What matches the reference, shown while it is on the left.
  stats?: string;
}) => {
  const current = choices.find((c) => c.side === left && !c.disabled);
  return (
    <span
      style={{ ...sans, display: "flex", alignItems: "center", minWidth: 0 }}
    >
      <Menu position="bottom-start" offset={4} radius={8} shadow="md">
        <Menu.Target>
          <UnstyledButton
            className={board.ghost}
            aria-label={`Left side: ${current?.label ?? "Before"}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: "0 1 auto",
              minWidth: 0,
              height: 24,
              padding: "0 6px",
              borderRadius: 6,
              color: palette.ink,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                fontFamily: "var(--mantine-font-family-monospace)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {left === "before" ? "Before" : current?.label}
            </span>
            {left !== "before" && <SideTag side={left} />}
            <ChevronIcon size={10} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown miw={280} p={4} style={{ borderColor: palette.control }}>
          {choices.map((choice) => (
            <Menu.Item
              key={`${choice.side}:${choice.label}`}
              disabled={choice.disabled}
              onClick={() => onChange(choice.side)}
              h={30}
              px={8}
              fz={12.5}
              leftSection={
                <span style={{ width: 14, display: "flex" }}>
                  {choice === current && (
                    <span style={{ color: palette.accent, display: "flex" }}>
                      <CheckIcon size={12} />
                    </span>
                  )}
                </span>
              }
              rightSection={
                <span style={{ fontSize: 11, color: palette.muted }}>
                  {choice.sub}
                </span>
              }
              styles={{
                itemLabel: {
                  fontFamily: "var(--mantine-font-family-monospace)",
                  fontSize: 12,
                  paddingRight: 12,
                },
              }}
            >
              {choice.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {left === "reference" && stats && (
        <span
          title={stats}
          style={{
            // Gives way before the reference's path does.
            flex: "0 1000 auto",
            minWidth: 0,
            marginLeft: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: 11.5,
            color: palette.muted,
            whiteSpace: "nowrap",
          }}
        >
          {stats}
        </span>
      )}
    </span>
  );
};

const SideTag = ({ side }: { side: "moved" | "reference" }) => (
  <span
    style={{
      padding: "0 6px",
      borderRadius: 9,
      background: side === "moved" ? MOVED_SOFT : REFERENCE_SOFT,
      color: side === "moved" ? MOVED_INK : REFERENCE_INK,
      fontSize: 11,
      fontWeight: 500,
      lineHeight: "18px",
      whiteSpace: "nowrap",
    }}
  >
    {side === "moved" ? "moved from" : "reference"}
  </span>
);

// The left sides a range or chunk offers: always the file before, then moved
// code's origin and the reference when it has them.
export function leftSideChoices({
  isNew,
  movedFrom,
  reference,
  namedBy,
}: {
  isNew: boolean;
  movedFrom?: { path: string };
  reference?: { path: string };
  namedBy: string | null;
}): LeftSideChoice[] {
  return [
    {
      side: "before",
      label: "This file, before",
      sub: isNew ? "new file, nothing to show" : "",
    },
    ...(movedFrom
      ? [{ side: "moved" as const, label: movedFrom.path, sub: "moved from" }]
      : []),
    reference
      ? {
          side: "reference",
          label: reference.path,
          sub: namedBy ? `reference, named by ${namedBy}` : "reference",
        }
      : {
          side: "reference",
          label: "Reference implementation",
          sub: "none named for these lines",
          disabled: true,
        },
  ];
}
