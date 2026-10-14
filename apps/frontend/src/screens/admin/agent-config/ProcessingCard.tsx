import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AgentConfig } from "@lib/contract";
import {
  FormGeneralErrors,
  FormRadioGroup,
  FormSubmitButton,
  StandardForm,
  palette,
} from "@lib/ds";
import { Card } from "../../../components/Card";
import { errorMessage } from "../../../logic/api/errors";
import { promptApi } from "./PromptSection";
import { useAgentConfigForm } from "./useAgentConfigForm";

type Mode = AgentConfig["processing"];

// Who groups new pull requests. `onModeChange` follows the choice before it
// is saved, so the processing prompt below can show that way's default.
export const ProcessingCard = ({
  config,
  onModeChange,
}: {
  config: AgentConfig;
  onModeChange: (mode: Mode) => void;
}) => {
  const { form, submit } = useAgentConfigForm(config, (values) =>
    onModeChange(values.processing),
  );
  return (
    <Card
      title="Pull request processing"
      description="Every new pull request starts out processing until its changes are split into brackets a reviewer can accept one at a time. Its agent can do that, or this server can, with Workers AI. While the server does it, agents get no processing prompt and cannot send brackets."
    >
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormRadioGroup
            name="processing"
            label="Who brackets pull requests"
            options={[
              {
                value: "agent",
                label: "The agent that opened it",
                description:
                  "The agent gets the processing prompt with its pull request and sends the brackets back.",
              },
              {
                value: "server",
                label: "This server, with Workers AI",
                description: config.serverAvailable
                  ? "A queued job asks the model below, in a sandbox that can read only that pull request."
                  : "Workers AI is not bound on this deployment.",
                disabled: !config.serverAvailable,
              },
            ]}
          />
          <EditedPromptWarning
            saved={config.processing}
            chosen={form.values.processing}
          />
          <FormGeneralErrors />
          <Group>
            <FormSubmitButton>Save</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Card>
  );
};

const FOR_MODE: Record<Mode, string> = {
  agent:
    "agents, which read the change themselves and send the brackets to the server",
  server:
    "the server's model, which gets the whole diff in the prompt and answers with the brackets",
};

// Switching keeps a prompt an admin wrote, which was likely written for the
// other way of processing; this says so before the switch is saved.
const EditedPromptWarning = ({
  saved,
  chosen,
}: {
  saved: Mode;
  chosen: Mode;
}) => {
  const api = promptApi("processingPrompt", chosen);
  const { data } = useQuery(api.queryOptions);
  const restore = useRestoreDefault(api);
  if (chosen === saved || !data || data.isDefault) {
    return null;
  }
  return (
    <Alert
      title="The processing prompt was edited"
      styles={{
        root: { background: palette.warningSoft },
        title: { color: palette.warningInk },
        message: { color: palette.warningInk },
      }}
    >
      <Stack gap={8}>
        <Text size="sm">
          It stays as it is when you switch, but it may not suit{" "}
          {FOR_MODE[chosen]}. Consider starting again from the {chosen} default.
        </Text>
        <Group>
          <Button
            size="xs"
            variant="default"
            loading={restore.busy}
            onClick={restore.run}
          >
            Use the {chosen} default
          </Button>
        </Group>
        {restore.error && (
          <Text size="sm" c="red">
            {restore.error}
          </Text>
        )}
      </Stack>
    </Alert>
  );
};

function useRestoreDefault(api: ReturnType<typeof promptApi>) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      queryClient.setQueryData(
        api.queryOptions.queryKey,
        await api.restoreDefault(),
      );
      await queryClient.invalidateQueries({
        queryKey: api.queryOptions.queryKey.slice(0, 1),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
