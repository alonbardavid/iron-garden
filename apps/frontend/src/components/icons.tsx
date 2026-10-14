import type { ReactNode } from "react";
import board from "./board.module.css";

// The design canvas's line icons, drawn on a 16-unit grid.
const Icon = ({
  size = 16,
  stroke = 1.5,
  flip = false,
  children,
}: {
  size?: number;
  stroke?: number;
  flip?: boolean;
  children: ReactNode;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0, transform: flip ? "rotate(180deg)" : undefined }}
  >
    {children}
  </svg>
);

type IconProps = { size?: number };

export const CodeIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m5.5 4.5-3.5 3.5 3.5 3.5" />
    <path d="m10.5 4.5 3.5 3.5-3.5 3.5" />
  </Icon>
);

export const PullRequestsIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M2.5 4h5M2.5 8h5M2.5 12h5" />
    <path d="m9.5 8.5 1.75 1.75L14.5 6.5" />
  </Icon>
);

export const SettingsIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="2.25" />
    <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.05 1.05M11.2 11.2l1.05 1.05M3.75 12.25l1.05-1.05M11.2 4.8l1.05-1.05" />
  </Icon>
);

export const WorkflowsIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="m6.75 5.75 3.25 2.25-3.25 2.25z" />
  </Icon>
);

export const OverviewIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="M5 6h6M5 8.5h6M5 11h3.5" />
  </Icon>
);

export const GroupsIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M8 2.5 14 5.75 8 9 2 5.75z" />
    <path d="M2 9.25 8 12.5l6-3.25" />
  </Icon>
);

export const FileIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M4 2.5h5l3 3v8H4z" />
    <path d="M9 2.5v3h3" />
  </Icon>
);

export const FolderIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M2 4.5a1 1 0 0 1 1-1h3.25l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
  </Icon>
);

// A folder whose flap is down: one whose contents show.
export const FolderOpenIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M2 11.5V4.5a1 1 0 0 1 1-1h3.25l1.5 1.5H12a1 1 0 0 1 1 1V7" />
    <path d="M2 12.5 3.6 7.7a1 1 0 0 1 .95-.7h9.2a.75.75 0 0 1 .7 1l-1.4 4.3a1 1 0 0 1-.95.7H3a1 1 0 0 1-1-1z" />
  </Icon>
);

export const MembersIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M2 13c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5" />
    <path d="M10.5 3.6a2.25 2.25 0 0 1 0 3.8M11.75 9.75c1.2.4 2 1.5 2.25 3.25" />
  </Icon>
);

// A prompt in a terminal: an agent's session.
export const SessionIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="m4.75 6.5 2 1.5-2 1.5M8.5 10h2.75" />
  </Icon>
);

export const GithubIcon = ({ size = 14 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export const FilterIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
  </Icon>
);

export const ArrowRightIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);

export const ArrowDownIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" />
  </Icon>
);

export const ShowBelowIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size} stroke={1.75}>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3.5 13.5h9" />
  </Icon>
);

export const ShowAboveIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size} stroke={1.75}>
    <path d="M8 13.5v-8M4.5 9 8 5.5 11.5 9M3.5 2.5h9" />
  </Icon>
);

export const FoldIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size}>
    <path d="M8 2.5v4M8 9.5v4M5.5 5 8 2.5 10.5 5M5.5 11 8 13.5 10.5 11" />
  </Icon>
);

export const ExpandIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </Icon>
);

// A pencil: change what is shown.
export const EditIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M10.5 3 13 5.5 6 12.5 3 13l.5-3z" />
    <path d="M9 4.5 11.5 7" />
  </Icon>
);

export const ChevronIcon = ({
  size = 12,
  up = false,
}: IconProps & { up?: boolean }) => (
  <Icon size={size} stroke={1.75} flip={up}>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Icon>
);

// Two overlapping sheets: code copied from a reference.
export const CopyIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size} stroke={1.75}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Icon>
);

export const ClockIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size} stroke={1.6}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 5v3.25l2 1.25" />
  </Icon>
);

export const TrashIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size} stroke={1.5}>
    <path d="M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.75 9h6.5l.75-9M6.75 7v4.5M9.25 7v4.5" />
  </Icon>
);

export const CloseIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size} stroke={1.75}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const Spinner = ({ size = 12 }: IconProps) => (
  <svg
    className={board.spin}
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M13.5 8A5.5 5.5 0 1 1 11.89 4.11" />
  </svg>
);

export const CheckIcon = ({ size = 10 }: IconProps) => (
  <Icon size={size} stroke={2.4}>
    <path d="m3.5 8.5 3 3 6-6.5" />
  </Icon>
);

export const ActivityIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 5v3.25l2 1.25" />
  </Icon>
);

export const CommitIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M1.5 8h4M10.5 8h4" />
  </Icon>
);

export const CommentIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M2.5 3.5h11v7.5h-6.5l-3 2.5v-2.5h-1.5z" />
  </Icon>
);

export const FlagIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M4 14V2.5M4 3h8.5l-2 3 2 3H4" />
  </Icon>
);

// A page of lines: an agent's transcript.
export const TranscriptIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <rect x="3" y="2" width="10" height="12" rx="1.5" />
    <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" />
  </Icon>
);

export const PlusIcon = ({ size = 12 }: IconProps) => (
  <Icon size={size} stroke={2}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const BranchIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="5" r="1.5" />
    <path d="M4.5 5v6M11.5 6.5c0 3-7 2-7 4.5" />
  </Icon>
);

export const HistoryIcon = ({ size = 14 }: IconProps) => (
  <Icon size={size}>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.7" />
    <path d="M2.5 2.5v3.2h3.2M8 5v3l2 1.5" />
  </Icon>
);

export const InfoIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v3.75M8 5h.01" />
  </Icon>
);
