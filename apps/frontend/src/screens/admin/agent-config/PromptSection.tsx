import {
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AgentConfig, AgentPrompt } from "@lib/contract";
import { Card } from "../../../components/Card";
import { EditIcon, ExpandIcon, FoldIcon } from "../../../components/icons";
import { IconButton } from "../../pull-requests/diff/controls";
import { orpc } from "../../../logic/api/orpc";
import { errorMessage } from "../../../logic/api/errors";
import { timeAgo } from "../../../logic/time";

type ProcessingMode = AgentConfig["processing"];

export type PromptName = "sessionPrompt" | "processingPrompt";

const TITLES: Record<PromptName, string> = {
  sessionPrompt: "Session prompt",
  processingPrompt: "Processing prompt",
};

function describe(which: PromptName, mode: ProcessingMode): string {
  if (which === "sessionPrompt") {
    return "What an agent reads when it starts a session, filled in for that session: how to get the code, open a pull request, share how it worked, and answer reviewers.";
  }
  return mode === "server"
    ? "Every new pull request starts out processing. The server's model gets this prompt with the whole diff, may read more of the repository, and answers with the brackets a reviewer accepts one at a time."
    : "Every new pull request starts out processing. Its agent gets this prompt, filled in for that pull request, and follows it to split the change into brackets a reviewer can accept one at a time.";
}

// One prompt an admin can replace or restore, as a section of the page: the
// prompt itself, and an editor in a modal. The processing prompt is shown as
// `mode` processes pull requests, with that way's default and placeholders.
export const PromptSection = ({
  which,
  mode = "agent",
}: {
  which: PromptName;
  mode?: ProcessingMode;
}) => {
  const api = promptApi(which, mode);
  const { data } = useQuery(api.queryOptions);
  return (
    <Card title={TITLES[which]} description={describe(which, mode)}>
      {data && <PromptPreview which={which} api={api} prompt={data} />}
    </Card>
  );
};

export interface PromptApi {
  queryOptions: ReturnType<typeof orpc.admin.sessionPrompt.get.queryOptions>;
  save(prompt: string): Promise<AgentPrompt>;
  restoreDefault(): Promise<AgentPrompt>;
}

// The calls that read and change a prompt; the processing prompt's take the
// way of processing it is seen as.
export function promptApi(which: PromptName, mode: ProcessingMode): PromptApi {
  if (which === "sessionPrompt") {
    return {
      queryOptions: orpc.admin.sessionPrompt.get.queryOptions(),
      save: (prompt) => orpc.admin.sessionPrompt.set.call({ prompt }),
      restoreDefault: () => orpc.admin.sessionPrompt.restoreDefault.call(),
    };
  }
  const input = { mode };
  return {
    queryOptions: orpc.admin.processingPrompt.get.queryOptions({ input }),
    save: (prompt) =>
      orpc.admin.processingPrompt.set.call({ ...input, prompt }),
    restoreDefault: () =>
      orpc.admin.processingPrompt.restoreDefault.call(input),
  };
}

// Lines of a prompt shown until it is expanded.
const PREVIEW_LINES = 10;
const PREVIEW_LINE_HEIGHT = 20;

const PromptPreview = ({
  which,
  api,
  prompt,
}: {
  which: PromptName;
  api: PromptApi;
  prompt: AgentPrompt;
}) => {
  const [editing, { open, close }] = useDisclosure(false);
  const [expanded, { toggle }] = useDisclosure(false);
  const title = TITLES[which].toLowerCase();
  return (
    <>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {savedState(prompt)}
        </Text>
        <IconButton label={`Edit the ${title}`} onClick={open}>
          <EditIcon />
        </IconButton>
      </Group>
      {/* Folded, the rest scrolls into view; focusable so the keyboard can
          scroll it too. */}
      <Code
        block
        tabIndex={0}
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: `${PREVIEW_LINE_HEIGHT}px`,
          fontSize: 12.5,
          maxHeight: expanded ? undefined : PREVIEW_LINES * PREVIEW_LINE_HEIGHT,
          overflowY: "auto",
        }}
      >
        {prompt.prompt}
      </Code>
      <ExpandToggle
        hidden={prompt.prompt.split("\n").length <= PREVIEW_LINES}
        expanded={expanded}
        onToggle={toggle}
      />
      <Modal
        opened={editing}
        onClose={close}
        title={`Edit the ${title}`}
        size="xl"
      >
        <PromptEditor
          label={TITLES[which]}
          api={api}
          prompt={prompt}
          onSaved={close}
        />
      </Modal>
    </>
  );
};

const ExpandToggle = ({
  hidden,
  expanded,
  onToggle,
}: {
  hidden: boolean;
  expanded: boolean;
  onToggle: () => void;
}) =>
  hidden ? null : (
    <Group justify="flex-end" mt={-6}>
      <IconButton label={expanded ? "Collapse" : "Expand"} onClick={onToggle}>
        {expanded ? <FoldIcon size={14} /> : <ExpandIcon />}
      </IconButton>
    </Group>
  );

const PromptEditor = ({
  label,
  api,
  prompt,
  onSaved,
}: {
  label: string;
  api: PromptApi;
  prompt: AgentPrompt;
  onSaved: () => void;
}) => {
  const { text, setText, busy, save, restore } = usePromptEditing(
    api,
    prompt,
    onSaved,
  );
  return (
    <Stack gap={12}>
      <Textarea
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={14}
        maxRows={28}
        styles={{
          input: {
            fontFamily: "var(--mantine-font-family-monospace)",
            fontSize: 13,
          },
        }}
      />
      <Group justify="space-between">
        <Button
          loading={busy}
          disabled={text.trim() === "" || text === prompt.prompt}
          onClick={save}
        >
          Save
        </Button>
        <Button
          variant="default"
          disabled={busy || prompt.isDefault}
          onClick={restore}
        >
          Restore default
        </Button>
      </Group>
      <Placeholders prompt={prompt} />
    </Stack>
  );
};

function savedState(prompt: AgentPrompt): string {
  return prompt.isDefault
    ? "Using the built-in default."
    : `Customized${prompt.updatedAt ? ` ${timeAgo(prompt.updatedAt)}` : ""}.`;
}

function usePromptEditing(
  api: PromptApi,
  prompt: AgentPrompt,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(prompt.prompt);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(prompt.prompt), [prompt.prompt]);
  const run = async (change: () => Promise<AgentPrompt>, message: string) => {
    setBusy(true);
    try {
      queryClient.setQueryData(api.queryOptions.queryKey, await change());
      notifications.show({ message });
      onSaved();
    } catch (err) {
      notifications.show({ color: "red", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return {
    text,
    setText,
    busy,
    save: () => run(() => api.save(text), "Prompt saved"),
    restore: () => run(() => api.restoreDefault(), "Default restored"),
  };
}

// What the template may use.
const Placeholders = ({ prompt }: { prompt: AgentPrompt }) => (
  <Stack gap={6}>
    <Text size="sm" fw={600}>
      Placeholders and conditions
    </Text>
    <Text size="sm" c="dimmed">
      Placeholders are filled in for each use; anything else in double braces is
      left as written. A condition keeps one branch of{" "}
      {"{{#if name}}…{{else}}…{{/if}}"} and drops the other; the {"{{else}}"}{" "}
      branch is optional.
    </Text>
    <Meanings
      rows={[
        ...prompt.placeholders.map((p) => ({
          code: `{{${p.name}}}`,
          meaning: p.meaning,
        })),
        ...prompt.conditions.map((c) => ({
          code: `{{#if ${c.name}}}`,
          meaning: c.meaning,
        })),
      ]}
    />
  </Stack>
);

const Meanings = ({ rows }: { rows: { code: string; meaning: string }[] }) => (
  <Table verticalSpacing={6}>
    <Table.Tbody>
      {rows.map((row) => (
        <Table.Tr key={row.code}>
          <Table.Td w={180}>
            <Code>{row.code}</Code>
          </Table.Td>
          <Table.Td>
            <Text size="sm">{row.meaning}</Text>
          </Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);
