import { Box, Group, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import type { SessionChatMessage, SessionOverview } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextarea,
  GENERAL_ERROR_KEY,
  palette,
  StandardForm,
  useForm,
} from "@lib/ds";
import { FloatingDock } from "../../components/FloatingDock";
import { Markdown } from "../../components/markdown/Markdown";
import { SkeletonChat } from "../../components/skeletons";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";
import { timeAgo } from "../../logic/time";
import { AgentAvatar } from "../pull-requests/chat/AgentPicker";
import { sendOnEnter } from "../pull-requests/chat/ChatComposer";
import { useScrolledToEnd } from "../pull-requests/chat/ChatThread";
import { useRepository } from "../repository/RepositoryLayout";

// How often an open chat with an active session looks for answers.
const MESSAGES_POLL_MS = 3000;

const schema = z.object({ body: z.string().trim().min(1, "Write something") });

const topBorder = { borderTop: `1px solid ${palette.line}` };

// The chat between the session's agent and the person it works for, at the
// bottom of the session's page as on a pull request. The agent gets each
// message as a notice on its listener and answers here.
export const SessionChatDock = ({ session }: { session: SessionOverview }) => {
  const [open, setOpen] = useState(false);
  const chat = useSessionChat(session, open);
  return (
    <FloatingDock
      open={open}
      setOpen={setOpen}
      content={{
        title: "Chat",
        avatar: <AgentAvatar name={session.agent.name} />,
        prompt: `Message ${session.agent.name} about this session…`,
        children: (
          <>
            <ChatMessages session={session} messages={chat.messages} />
            <ChatFooter session={session} send={chat.send} />
          </>
        ),
      }}
    />
  );
};

const ChatFooter = ({
  session,
  send,
}: {
  session: SessionOverview;
  send: (body: string) => Promise<unknown>;
}) =>
  session.status === "active" ? (
    <ChatComposer session={session} send={send} />
  ) : (
    <Text size="sm" c="dimmed" px={16} py={12} style={topBorder}>
      The session ended; its agent no longer listens.
    </Text>
  );

const ChatMessages = ({
  session,
  messages,
}: {
  session: SessionOverview;
  messages: SessionChatMessage[] | undefined;
}) => {
  const end = useScrolledToEnd(messages?.length);
  return (
    <Stack
      gap={14}
      px={14}
      pt={14}
      pb={8}
      style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}
    >
      {messages ? (
        <Thread session={session} messages={messages} />
      ) : (
        <SkeletonChat />
      )}
      <div ref={end} />
    </Stack>
  );
};

const Thread = ({
  session,
  messages,
}: {
  session: SessionOverview;
  messages: SessionChatMessage[];
}) =>
  messages.length === 0 ? (
    <EmptyChat session={session} />
  ) : (
    messages.map((message) => (
      <ChatMessage key={message.id} message={message} />
    ))
  );

const EmptyChat = ({ session }: { session: SessionOverview }) => (
  <Text size="sm" c="dimmed" ta="center" py={32}>
    Ask {session.agent.name} about its work, or tell it what to do next. It gets
    your message as a notice on its listener
    {session.live ? "" : " when it next checks"}, and answers here.
  </Text>
);

const ChatMessage = ({ message }: { message: SessionChatMessage }) =>
  message.sender === "person" ? (
    <PersonMessage message={message} />
  ) : (
    <AgentMessage message={message} />
  );

const PersonMessage = ({ message }: { message: SessionChatMessage }) => (
  <Stack gap={4} align="flex-end">
    <Text fz={11.5} c={palette.muted}>
      You · {timeAgo(message.createdAt)} ·{" "}
      {message.delivered ? "Delivered" : "Waiting for the agent"}
    </Text>
    <Box
      maw="80%"
      px={12}
      py={8}
      fz={13}
      bg={palette.accentSoft}
      style={{ borderRadius: "14px 14px 4px 14px" }}
    >
      <Markdown>{message.body}</Markdown>
    </Box>
  </Stack>
);

const AgentMessage = ({ message }: { message: SessionChatMessage }) => (
  <Stack gap={4} align="flex-start">
    <Text fz={11.5} c={palette.muted}>
      {message.author} · {timeAgo(message.createdAt)}
    </Text>
    <Box maw="88%" fz={13}>
      <Markdown>{message.body}</Markdown>
    </Box>
  </Stack>
);

// The box empties at once; a failed send puts the text back.
const ChatComposer = ({
  session,
  send,
}: {
  session: SessionOverview;
  send: (body: string) => Promise<unknown>;
}) => {
  const form = useForm({ initialValues: { body: "" }, schema });
  const submit = async ({ body }: typeof form.values) => {
    form.reset();
    try {
      await send(body.trim());
    } catch (err) {
      form.setValues({ body });
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack gap={8} px={12} py={12} style={topBorder}>
        <Group gap={8} align="flex-end" wrap="nowrap">
          <FormTextarea
            name="body"
            aria-label="Message"
            placeholder={`Message ${session.agent.name}…`}
            autosize
            minRows={2}
            maxRows={8}
            onKeyDown={sendOnEnter}
            style={{ flex: 1, minWidth: 0 }}
          />
          <FormSubmitButton size="compact-md">Send</FormSubmitButton>
        </Group>
        <FormGeneralErrors />
      </Stack>
    </StandardForm>
  );
};

// The thread, read again while the panel is open on an active session, and
// a send that adds the stored message to it.
function useSessionChat(session: SessionOverview, open: boolean) {
  const { name } = useRepository();
  const queryClient = useQueryClient();
  const input = { name, id: session.id };
  const queryKey = orpc.repositories.sessions.chat.messages.queryKey({ input });
  const { data: messages } = useQuery(
    orpc.repositories.sessions.chat.messages.queryOptions({
      input,
      refetchInterval:
        open && session.status === "active" ? MESSAGES_POLL_MS : false,
    }),
  );
  const sending = useMutation(
    orpc.repositories.sessions.chat.send.mutationOptions({
      onSuccess: (message) =>
        queryClient.setQueryData<SessionChatMessage[]>(queryKey, (current) => [
          ...(current ?? []),
          message,
        ]),
    }),
  );
  return {
    messages,
    send: (body: string) => sending.mutateAsync({ ...input, body }),
  };
}
