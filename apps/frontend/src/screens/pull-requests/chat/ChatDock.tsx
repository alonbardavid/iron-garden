import { Box, Group, Text, UnstyledButton } from "@mantine/core";
import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ChatAgent } from "@lib/contract";
import { palette } from "@lib/ds";
import { ChevronIcon } from "../../../components/icons";
import { AgentPicker, AgentAvatar } from "./AgentPicker";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { ContextChip } from "./ContextChip";
import { useChat, type Chat } from "./ChatProvider";
import { CHAT_ROOT_ATTRIBUTE } from "./useSelectedText";

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

// The chat at the bottom of every page of a pull request: a bar that opens
// into a panel you can drag anywhere. It shows while an agent listens.
export const ChatDock = () => {
  const chat = useChat();
  const dock = useDockPosition();
  if (!chat?.agent) {
    return null;
  }
  return chat.open ? (
    <ChatPanel chat={chat} agent={chat.agent} dock={dock} />
  ) : (
    <ChatBar chat={chat} agent={chat.agent} dock={dock} />
  );
};

type Dock = ReturnType<typeof useDockPosition>;

const ChatBar = ({
  chat,
  agent,
  dock,
}: {
  chat: Chat;
  agent: ChatAgent;
  dock: Dock;
}) => (
  <Group
    gap={8}
    wrap="nowrap"
    h={BAR_HEIGHT}
    pl={12}
    pr={10}
    style={{ ...floating, ...dock.barStyle }}
    {...{ [CHAT_ROOT_ATTRIBUTE]: true }}
  >
    <AgentAvatar name={agent.agent.name} />
    <UnstyledButton
      onClick={() => chat.setOpen(true)}
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
      Ask {agent.agent.name} about this change…
    </UnstyledButton>
    <ContextChip context={chat.context} title="What the chat gets as context" />
    <UnstyledButton
      aria-label="Open the chat"
      onClick={() => chat.setOpen(true)}
      w={28}
      h={28}
      c={palette.secondary}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ChevronIcon up />
    </UnstyledButton>
  </Group>
);

const ChatPanel = ({
  chat,
  agent,
  dock,
}: {
  chat: Chat;
  agent: ChatAgent;
  dock: Dock;
}) => (
  <Box
    component="section"
    {...{ [CHAT_ROOT_ATTRIBUTE]: true }}
    aria-label="Chat"
    h={HEIGHT}
    style={{
      ...floating,
      ...dock.panelStyle,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
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
        Chat
      </Text>
      <AgentPicker chat={chat} agent={agent} />
      <Box style={{ flex: 1 }} />
      <UnstyledButton
        aria-label="Collapse the chat"
        onClick={() => chat.setOpen(false)}
        w={28}
        h={28}
        c={palette.secondary}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronIcon />
      </UnstyledButton>
    </Group>
    <ChatThread chat={chat} agent={agent} />
    <ChatComposer chat={chat} agent={agent} />
  </Box>
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
