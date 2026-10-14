import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { palette } from "@lib/ds";
import board from "./board.module.css";

// A link to a section, underlined when it is the page you are on. A tab
// within a page sits on the border below it.
export const NavTab = ({
  to,
  icon,
  label,
  badge,
  current,
  inPage = false,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
  current: boolean;
  inPage?: boolean;
}) => (
  <Link
    to={to}
    aria-current={current ? "page" : undefined}
    className={current ? undefined : board.tab}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: inPage ? "10px 8px 11px" : "8px 8px 10px",
      marginBottom: inPage ? -1 : 0,
      borderBottom: `2px solid ${current ? palette.accent : "transparent"}`,
      color: current ? palette.ink : palette.secondary,
      fontSize: 14,
      fontWeight: current ? 600 : 400,
      textDecoration: "none",
    }}
  >
    {icon}
    {label}
    {badge}
  </Link>
);

export const TabCount = ({ n }: { n: number }) => (
  <span
    style={{
      minWidth: 20,
      padding: "0 6px",
      borderRadius: 10,
      background: palette.hover,
      color: palette.secondary,
      fontSize: 12,
      fontWeight: 500,
      textAlign: "center",
    }}
  >
    {n}
  </span>
);
