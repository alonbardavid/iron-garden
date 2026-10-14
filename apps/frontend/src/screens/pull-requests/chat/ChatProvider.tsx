import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import type {
  ChatAgent,
  ChatContext,
  ChatMessage,
  PullRequestDetail,
} from "@lib/contract";
import { errorMessage } from "../../../logic/api/errors";
import { orpc } from "../../../logic/api/orpc";
import { chatPage, type PullRequestTab } from "../paths";
import { defaultAgent, type LinesRef } from "./model";

// How often the open chat looks for answers, and the agents for who listens.
const MESSAGES_POLL_MS = 3000;
const AGENTS_POLL_MS = 15_000;

// A message in the thread; `sending` until the server has stored it.
export type ThreadMessage = ChatMessage & { sending?: boolean };

export interface Chat {
  pr: PullRequestDetail;
  // Undefined until loaded.
  agents?: ChatAgent[];
  agent?: ChatAgent;
  pick: (channel: string) => void;
  messages?: ThreadMessage[];
  open: boolean;
  setOpen: (open: boolean) => void;
  // What the next message is about: the page, and the lines being commented
  // on if any.
  context: ChatContext;
  // The lines of the comment being written, which the chat gets too.
  setSelection: (lines: LinesRef | null) => void;
  send: (body: string, context: ChatContext | null) => Promise<unknown>;
  sending: boolean;
  // Takes back a message the agent has not had yet.
  remove: (message: string) => void;
}

const ChatContextValue = createContext<Chat | null>(null);

// The chat with the agents listening on a pull request. It lives above the
// tabs, so the conversation follows the person from page to page.
export const ChatProvider = ({
  pr,
  tab,
  children,
}: {
  pr: PullRequestDetail;
  tab: PullRequestTab;
  children: ReactNode;
}) => {
  const value = useChatState(pr, tab);
  return (
    <ChatContextValue.Provider value={value}>
      {children}
    </ChatContextValue.Provider>
  );
};

// Null outside a pull request, or for an agent looking at one.
export function useChat(): Chat | null {
  return useContext(ChatContextValue);
}

function useChatState(pr: PullRequestDetail, tab: PullRequestTab): Chat {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<LinesRef | null>(null);
  const context = usePageContext(tab, selection);
  const listening = useAgents(pr);
  const thread = useThread(pr, listening.agent?.channel, open);
  return {
    pr,
    ...listening,
    open,
    setOpen,
    context,
    setSelection,
    ...thread,
  };
}

// The agents listening, and the one you talk to.
function useAgents(pr: PullRequestDetail) {
  const [picked, pick] = useState<string | null>(null);
  const { data: agents } = useQuery(
    orpc.pullRequests.chat.agents.queryOptions({
      input: { name: pr.repository, number: pr.number },
      refetchInterval: AGENTS_POLL_MS,
    }),
  );
  const agent =
    agents?.find((a) => a.channel === picked) ??
    (agents && defaultAgent(agents));
  return { agents, agent, pick };
}

// The tab, with the file or bracket it shows and the selected lines.
function usePageContext(
  tab: PullRequestTab,
  selection: LinesRef | null,
): ChatContext {
  const [search] = useSearchParams();
  const file = search.get("file") ?? undefined;
  const group = search.get("bracket") ?? undefined;
  return useMemo(() => {
    const page = chatPage(tab);
    if (selection && (tab === "files" || tab === "brackets")) {
      return { page, ...selection };
    }
    if (tab === "files") {
      return { page, path: file };
    }
    return tab === "brackets" ? { page, group } : { page };
  }, [tab, file, group, selection]);
}

// The conversation with the agent on `channel`. Each agent's thread is its
// own query, and a send or delete updates the thread it was made in, even
// when you have switched agents since.
function useThread(
  pr: PullRequestDetail,
  channel: string | undefined,
  open: boolean,
) {
  const queryClient = useQueryClient();
  const pullRequest = { name: pr.repository, number: pr.number };
  const keyOf = (forChannel: string) =>
    orpc.pullRequests.chat.messages.queryKey({
      input: { ...pullRequest, channel: forChannel },
    });
  const update = (
    forChannel: string,
    change: (messages: ThreadMessage[]) => ThreadMessage[],
  ) =>
    queryClient.setQueryData<ThreadMessage[]>(keyOf(forChannel), (current) =>
      change(current ?? []),
    );
  const { data: messages } = useQuery(
    orpc.pullRequests.chat.messages.queryOptions({
      input: { ...pullRequest, channel: channel ?? "" },
      enabled: !!channel,
      refetchInterval: open ? MESSAGES_POLL_MS : false,
    }),
  );
  const onError = (err: Error) =>
    notifications.show({ color: "red", message: errorMessage(err) });
  // A message shows at once, marked as sending, and is swapped for the stored
  // one when it arrives.
  const sending = useMutation(
    orpc.pullRequests.chat.send.mutationOptions({
      onMutate: async (sent) => {
        await queryClient.cancelQueries({ queryKey: keyOf(sent.channel) });
        const draft = sendingMessage(sent.body, sent.context ?? null);
        update(sent.channel, (current) => [...current, draft]);
        return { draftId: draft.id };
      },
      onSuccess: (message, sent, context) =>
        update(sent.channel, (current) =>
          current.map((m) => (m.id === context?.draftId ? message : m)),
        ),
      onError: (err, sent, context) => {
        update(sent.channel, (current) =>
          current.filter((m) => m.id !== context?.draftId),
        );
        onError(err);
      },
    }),
  );
  const deleting = useMutation(
    orpc.pullRequests.chat.deleteMessage.mutationOptions({
      onSuccess: (_, removed) =>
        update(removed.channel, (current) =>
          current.filter((m) => m.id !== removed.message),
        ),
      onError,
    }),
  );
  return {
    messages: channel ? messages : undefined,
    sending: sending.isPending,
    send: (body: string, context: ChatContext | null) =>
      sending.mutateAsync({
        ...pullRequest,
        channel: channel ?? "",
        body,
        context: context ?? undefined,
      }),
    remove: (message: string) =>
      deleting.mutate({ ...pullRequest, channel: channel ?? "", message }),
  };
}

let drafts = 0;

function sendingMessage(
  body: string,
  context: ChatContext | null,
): ThreadMessage {
  drafts += 1;
  return {
    id: `sending-${drafts}`,
    sender: "person",
    author: "You",
    body,
    context,
    delivered: false,
    workingAt: null,
    createdAt: Date.now(),
    sending: true,
  };
}
