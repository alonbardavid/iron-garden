import { Box, Group, Text, UnstyledButton } from "@mantine/core";
import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { palette } from "@lib/ds";
import { ChevronIcon } from "./icons";

const WIDTH = 440;
const HEIGHT = 600;
const BAR_HEIGHT = 56;
const MARGIN = 24;

const floating: CSSProperties = {
  position: "fixed",
  zIndex: 30,
  width: WIDTH,
  border: `1px solid ${palette.control}`,
  borderRadius: 12,
  background: "white",
  boxShadow: "0 12px 36px rgba(22, 25, 29, 0.18)",
};

// What a dock holds: the bar it collapses to, and the panel it opens into.
export interface DockContent {
  title: string;
  // Who the conversation is with, at the start of the bar.
  avatar: ReactNode;
  // What the bar invites you to write.
  prompt: string;
  // Beside the prompt on the bar, and beside the title on the panel.
  barExtra?: ReactNode;
  headerExtra?: ReactNode;
  // The panel's body: a scrolling thread and a composer.
  children: ReactNode;
  // Attributes for the dock's root element, either way.
  rootProps?: Record<string, unknown>;
}

// A conversation at the bottom right of the page: a bar that opens into a
// panel you can drag anywhere.
export const FloatingDock = ({
  open,
  setOpen,
  content,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  content: DockContent;
}) => {
  const dock = useDockPosition();
  return open ? (
    <DockPanel
      content={content}
      dock={dock}
      onCollapse={() => setOpen(false)}
    />
  ) : (
    <DockBar content={content} dock={dock} onOpen={() => setOpen(true)} />
  );
};

type Dock = ReturnType<typeof useDockPosition>;

const DockBar = ({
  content,
  dock,
  onOpen,
}: {
  content: DockContent;
  dock: Dock;
  onOpen: () => void;
}) => (
  <Group
    gap={8}
    wrap="nowrap"
    h={BAR_HEIGHT}
    pl={12}
    pr={10}
    style={{ ...floating, ...dock.barStyle }}
    {...content.rootProps}
  >
    {content.avatar}
    <UnstyledButton
      onClick={onOpen}
      h={34}
      px={10}
      fz={13}
      c={palette.muted}
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        border: `1px solid ${palette.control}`,
        borderRadius: 8,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {content.prompt}
    </UnstyledButton>
    {content.barExtra}
    <IconButton
      label={`Open the ${content.title.toLowerCase()}`}
      onClick={onOpen}
    >
      <ChevronIcon up />
    </IconButton>
  </Group>
);

const DockPanel = ({
  content,
  dock,
  onCollapse,
}: {
  content: DockContent;
  dock: Dock;
  onCollapse: () => void;
}) => (
  <Box
    component="section"
    aria-label={content.title}
    h={HEIGHT}
    style={{
      ...floating,
      ...dock.panelStyle,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
    {...content.rootProps}
  >
    <Group
      gap={8}
      h={44}
      pl={10}
      pr={8}
      wrap="nowrap"
      onMouseDown={dock.grab}
      title="Drag to move"
      style={{
        flex: "0 0 44px",
        borderBottom: `1px solid ${palette.line}`,
        cursor: "grab",
        userSelect: "none",
      }}
    >
      <Grip />
      <Text span fz={13} fw={600}>
        {content.title}
      </Text>
      {content.headerExtra}
      <Box style={{ flex: 1 }} />
      <IconButton
        label={`Collapse the ${content.title.toLowerCase()}`}
        onClick={onCollapse}
      >
        <ChevronIcon />
      </IconButton>
    </Group>
    {content.children}
  </Box>
);

const IconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <UnstyledButton
    aria-label={label}
    onClick={onClick}
    w={28}
    h={28}
    c={palette.secondary}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </UnstyledButton>
);

const Grip = () => (
  <Box c={palette.faint} display="flex" aria-hidden>
    <svg width="10" height="14" viewBox="0 0 10 16" fill="currentColor">
      {[3, 8, 13].flatMap((cy) =>
        [3, 7].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" />
        )),
      )}
    </svg>
  </Box>
);

// Bottom right until dragged; the collapsed bar sits where the panel's
// bottom edge was.
function useDockPosition() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (!drag) {
      return;
    }
    const move = (e: MouseEvent) =>
      setPos({
        x: clamp(e.clientX - drag.dx, window.innerWidth - WIDTH),
        y: clamp(e.clientY - drag.dy, window.innerHeight - HEIGHT),
      });
    const stop = () => setDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [drag]);
  const grab = (e: ReactMouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }
    e.preventDefault();
    const left = pos?.x ?? window.innerWidth - MARGIN - WIDTH;
    const top = pos?.y ?? window.innerHeight - MARGIN - HEIGHT;
    setPos({ x: left, y: top });
    setDrag({ dx: e.clientX - left, dy: e.clientY - top });
  };
  const corner: CSSProperties = { right: MARGIN, bottom: MARGIN };
  return {
    grab,
    panelStyle: pos ? { left: pos.x, top: pos.y } : corner,
    barStyle: pos ? { left: pos.x, top: pos.y + HEIGHT - BAR_HEIGHT } : corner,
  };
}

const clamp = (value: number, max: number) =>
  Math.max(0, Math.min(value, Math.max(0, max)));
