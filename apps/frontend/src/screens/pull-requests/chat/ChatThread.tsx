import { Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useEffect, useRef, type ReactNode } from "react";
import type { Components, ExtraProps } from "react-markdown";
import type { ChatAgent, ChatMessage } from "@lib/contract";
import { palette } from "@lib/ds";
import {
  CheckIcon,
  ClockIcon,
  Spinner,
  TrashIcon,
} from "../../../components/icons";
import { Markdown } from "../../../components/markdown/Markdown";
import { timeAgo } from "../../../logic/time";
import { chatPageTab, pullRequestPath } from "../paths";
import { AgentAvatar } from "./AgentPicker";
import styles from "./chat.module.css";
import type { Chat, ThreadMessage } from "./ChatProvider";
import { ContextChip } from "./ContextChip";
import { LinesBlock } from "./LinesBlock";
import { agentWorking, deliveryOf, type Delivery } from "./model";
import { SkeletonChat } from "../../../components/skeletons";

// Your conversation with the agent, newest at the bottom.
export const ChatThread = ({
  chat,
  agent,
}: {
  chat: Chat;
  agent: ChatAgent;
}) => {
  const end = useScrolledToEnd(chat.messages?.length);
  return (
    <Stack
      gap={14}
      px={14}
      pt={14}
      pb={8}
      style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}
    >
      <Notice agent={agent} empty={chat.messages?.length === 0} />
      {!chat.messages && <SkeletonChat />}
      {chat.messages?.map((message) => (
        <Message key={message.id} chat={chat} message={message} />
      ))}
      <Thinking agent={agent} messages={chat.messages} />
      <div ref={end} />
    </Stack>
  );
};

const Message = ({ chat, message }: { chat: Chat; message: ThreadMessage }) =>
  message.sender === "person" ? (
    <PersonMessage chat={chat} message={message} />
  ) : (
    <AgentMessage chat={chat} message={message} />
  );

const PersonMessage = ({
  chat,
  message,
}: {
  chat: Chat;
  message: ThreadMessage;
}) => (
  <Stack gap={4} align="flex-end">
    <Text fz={11.5} c={palette.muted}>
      You · {timeAgo(message.createdAt)}
    </Text>
    <Box
      maw="88%"
      px={12}
      py={8}
      fz={13}
      bg={palette.accentSoft}
      pos="relative"
      style={{ borderRadius: "14px 14px 4px 14px" }}
    >
      <Ticker
        delivery={deliveryOf(message, !!chat.agent?.live)}
        agent={chat.agent?.agent.name ?? "the agent"}
      />
      <Markdown>{message.body}</Markdown>
      <AboutChip chat={chat} message={message} />
    </Box>
    <Undelivered chat={chat} message={message} />
  </Stack>
);

// The file, lines or bracket a message was about, at the foot of its bubble.
// The page alone, or selected text, goes to the agent without showing here.
const AboutChip = ({
  chat,
  message: { context },
}: {
  chat: Chat;
  message: ChatMessage;
}) =>
  context &&
  (context.path || context.group) && (
    <Box mt={6}>
      <ContextChip
        context={context}
        title="What the message was about"
        to={pullRequestPath(chat.pr, chatPageTab(context.page), {
          file: context.path,
          bracket: context.group,
        })}
      />
    </Box>
  );

// Whether the agent has a message yet, on the bubble's top-left corner.
const Ticker = ({ delivery, agent }: { delivery: Delivery; agent: string }) => {
  const { label, icon } = TICKS[delivery];
  return (
    <Box
      role="img"
      aria-label={label.replace("{agent}", agent)}
      title={label.replace("{agent}", agent)}
      pos="absolute"
      top={-7}
      left={-7}
      w={18}
      h={18}
      bg="white"
      c={delivery === "received" ? palette.added : palette.muted}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9,
        boxShadow: `0 0 0 1px ${palette.control}`,
      }}
    >
      {icon}
    </Box>
  );
};

const TICKS: Record<Delivery, { label: string; icon: ReactNode }> = {
  sending: { label: "Sending to {agent}", icon: <Spinner size={10} /> },
  waiting: {
    label: "{agent} is offline; it gets this when it reconnects",
    icon: <ClockIcon size={11} />,
  },
  received: { label: "{agent} received this", icon: <CheckIcon size={9} /> },
};

// A message the agent has not had yet can be taken back; while the agent is
// offline it says when it goes out.
const Undelivered = ({
  chat,
  message,
}: {
  chat: Chat;
  message: ThreadMessage;
}) =>
  !message.delivered &&
  !message.sending && (
    <Group gap={6} fz={11.5} c={palette.muted}>
      {!chat.agent?.live &&
        `Sent when ${chat.agent?.agent.name ?? "the agent"} reconnects`}
      <UnstyledButton
        aria-label="Delete this message"
        title="Delete this message"
        onClick={() => chat.remove(message.id)}
        c={palette.muted}
        display="flex"
      >
        <TrashIcon />
      </UnstyledButton>
    </Group>
  );

// The agent said it is working on an answer: dots until it answers, or for
// five minutes at most.
const Thinking = ({
  agent,
  messages,
}: {
  agent: ChatAgent;
  messages: ThreadMessage[] | undefined;
}) =>
  messages &&
  agentWorking(messages, Date.now()) && (
    <Group gap={8} align="center" wrap="nowrap">
      <AgentAvatar name={agent.agent.name} />
      <Box
        role="status"
        aria-label={`${agent.agent.name} is working on an answer`}
        className={styles.thinking}
      >
        <span />
        <span />
        <span />
      </Box>
    </Group>
  );

const AgentMessage = ({
  chat,
  message,
}: {
  chat: Chat;
  message: ChatMessage;
}) => (
  <Group gap={8} align="flex-start" wrap="nowrap">
    <AgentAvatar name={message.author} />
    <Stack gap={4} fz={13} style={{ flex: 1, minWidth: 0 }}>
      <Text fz={11.5} c={palette.muted}>
        {message.author} · {timeAgo(message.createdAt)}
      </Text>
      <Markdown components={answerComponents(chat)}>{message.body}</Markdown>
    </Stack>
  </Group>
);

// An agent shows lines of the change with a ```lines block.
function answerComponents(chat: Chat): Components {
  return {
    pre: ({ node, children }) => {
      const spec = linesSpecOf(node);
      return spec === null ? (
        <pre>{children}</pre>
      ) : (
        <LinesBlock pr={chat.pr} spec={spec} />
      );
    },
  };
}

// The text of a ```lines block, or null for any other.
function linesSpecOf(pre: ExtraProps["node"]): string | null {
  const code = pre?.children[0];
  if (
    code?.type !== "element" ||
    !String(code.properties.className ?? "").includes("language-lines")
  ) {
    return null;
  }
  const text = code.children[0];
  return text?.type === "text" ? text.value : null;
}

const Notice = ({ agent, empty }: { agent: ChatAgent; empty: boolean }) =>
  !agent.live ? <Away agent={agent} /> : empty && <Empty agent={agent} />;

const Away = ({ agent }: { agent: ChatAgent }) => (
  <Text fz={12} c={palette.secondary} bg={palette.page} px={10} py={6}>
    {agent.agent.name} is offline. Messages you send now go out when it
    reconnects, and you can delete them until then.
  </Text>
);

const Empty = ({ agent }: { agent: ChatAgent }) => (
  <Text fz={12.5} c={palette.muted} ta="center" mt="auto">
    {agent.adHoc
      ? "Ask anything about this change. This server's model answers, with the diff, its brackets and the agent's transcripts, and sees what you are looking at."
      : `Ask ${agent.agent.name} about this change. It sees what you are looking at.`}
  </Text>
);

// Keeps the newest message in view as messages arrive.
function useScrolledToEnd(count: number | undefined) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);
  return end;
}
