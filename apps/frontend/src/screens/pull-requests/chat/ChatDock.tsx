import type { ChatAgent } from "@lib/contract";
import { FloatingDock } from "../../../components/FloatingDock";
import { AgentPicker, AgentAvatar } from "./AgentPicker";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { ContextChip } from "./ContextChip";
import { useChat, type Chat } from "./ChatProvider";
import { CHAT_ROOT_ATTRIBUTE } from "./useSelectedText";

// The chat at the bottom of every page of a pull request: a bar that opens
// into a panel you can drag anywhere. It shows while an agent listens.
export const ChatDock = () => {
  const chat = useChat();
  return chat?.agent ? <AgentDock chat={chat} agent={chat.agent} /> : null;
};

const AgentDock = ({ chat, agent }: { chat: Chat; agent: ChatAgent }) => (
  <FloatingDock
    open={chat.open}
    setOpen={chat.setOpen}
    content={{
      title: "Chat",
      avatar: <AgentAvatar name={agent.agent.name} />,
      prompt: `Ask ${agent.agent.name} about this change…`,
      barExtra: (
        <ContextChip
          context={chat.context}
          title="What the chat gets as context"
        />
      ),
      headerExtra: <AgentPicker chat={chat} agent={agent} />,
      rootProps: { [CHAT_ROOT_ATTRIBUTE]: true },
      children: (
        <>
          <ChatThread chat={chat} agent={agent} />
          <ChatComposer chat={chat} agent={agent} />
        </>
      ),
    }}
  />
);
