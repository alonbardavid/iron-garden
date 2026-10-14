import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import type { ChatAgent, ChatContext } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextarea,
  GENERAL_ERROR_KEY,
  palette,
  StandardForm,
  useForm,
} from "@lib/ds";
import { CloseIcon } from "../../../components/icons";
import { errorMessage } from "../../../logic/api/errors";
import type { Chat } from "./ChatProvider";
import { Chip, ContextChip } from "./ContextChip";
import { contextLabel } from "./model";
import { useSelectedText } from "./useSelectedText";

const schema = z.object({ body: z.string().trim().min(1, "Write something") });

// A message to the agent, with what you are looking at unless you drop it.
export const ChatComposer = ({
  chat,
  agent,
}: {
  chat: Chat;
  agent: ChatAgent;
}) => {
  const form = useForm({ initialValues: { body: "" }, schema });
  const context = useDroppableContext(chat.context);
  const { selectedText, clearSelectedText } = useSelectedText();
  // The message shows in the thread at once, so the box empties at once; a
  // failed send puts the text back.
  const send = async ({ body }: typeof form.values) => {
    const sent = withSelectedText(context.value, chat.context, selectedText);
    form.reset();
    clearSelectedText();
    try {
      await chat.send(body.trim(), sent);
    } catch (err) {
      form.setValues({ body });
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <StandardForm form={form} onSubmit={send}>
      <Stack
        gap={8}
        px={12}
        pt={8}
        pb={12}
        style={{ borderTop: `1px solid ${palette.line}` }}
      >
        <ContextLine
          context={context.value}
          onDrop={context.drop}
          selectedText={selectedText}
          onDropSelectedText={clearSelectedText}
        />
        <Group gap={8} align="flex-end" wrap="nowrap">
          <FormTextarea
            name="body"
            aria-label="Message"
            placeholder={`Ask ${agent.agent.name} about this change…`}
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

const ContextLine = ({
  context,
  onDrop,
  selectedText,
  onDropSelectedText,
}: {
  context: ChatContext | null;
  onDrop: () => void;
  selectedText: string | null;
  onDropSelectedText: () => void;
}) =>
  context || selectedText ? (
    <Group gap={6} fz={12} c={palette.muted}>
      Sends with
      {context && (
        <ContextChip context={context} title="What the chat gets as context">
          <DropButton label="Send without this context" onClick={onDrop} />
        </ContextChip>
      )}
      <SelectedTextChip text={selectedText} onDrop={onDropSelectedText} />
    </Group>
  ) : (
    <Text fz={12} c={palette.muted}>
      Sends without context
    </Text>
  );

// The text selected on the page, which goes to the agent but not into the
// thread.
const SelectedTextChip = ({
  text,
  onDrop,
}: {
  text: string | null;
  onDrop: () => void;
}) =>
  text && (
    <Chip label="Your selection" title={text.slice(0, 300)}>
      <DropButton label="Send without your selection" onClick={onDrop} />
    </Chip>
  );

const DropButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <UnstyledButton
    aria-label={label}
    title={label}
    onClick={onClick}
    c="inherit"
    display="flex"
  >
    <CloseIcon size={10} />
  </UnstyledButton>
);

// The page's context, until you drop it; looking at something else brings
// it back.
function useDroppableContext(context: ChatContext) {
  const label = contextLabel(context);
  const [dropped, setDropped] = useState<string | null>(null);
  return {
    value: dropped === label ? null : context,
    drop: () => setDropped(label),
  };
}

// The text selected on the page rides along with the context, even when the
// page's context was dropped.
function withSelectedText(
  context: ChatContext | null,
  page: ChatContext,
  selectedText: string | null,
): ChatContext | null {
  if (!selectedText) {
    return context;
  }
  return { ...(context ?? { page: page.page }), selectedText };
}

// Enter sends; shift-enter starts a new line.
function sendOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}
