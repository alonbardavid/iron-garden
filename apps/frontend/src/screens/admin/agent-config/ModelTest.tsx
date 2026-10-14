import { Button, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AgentConfig, ModelTest } from "@lib/contract";
import { useFormContext } from "@lib/ds";
import { orpc } from "../../../logic/api/orpc";
import { errorMessage } from "../../../logic/api/errors";
import { timeAgo } from "../../../logic/time";

// Asks the model and gateway in the form for a one-line answer, saved or not.
export const TestModelButton = ({ config }: { config: AgentConfig }) => {
  const { test, busy } = useModelTest();
  return (
    <Button
      variant="default"
      loading={busy}
      disabled={!config.serverAvailable}
      title={
        config.serverAvailable ? undefined : "Workers AI is not bound here"
      }
      onClick={test}
    >
      Test model
    </Button>
  );
};

// How the last test went, by whoever ran it.
export const LastModelTest = ({ test }: { test: ModelTest | null }) =>
  test ? (
    <Text size="sm" c={test.ok ? "green.8" : "red.7"} role="status">
      {outcome(test)}
      <Text span c="dimmed">
        {" "}
        · {when(test)}
      </Text>
    </Text>
  ) : null;

function outcome(test: ModelTest): string {
  return test.ok
    ? `${test.model} answered in ${(test.ms / 1000).toFixed(1)}s`
    : `${test.model} failed: ${test.error}`;
}

function when(test: ModelTest): string {
  const through = test.gateway ? ` through ${test.gateway}` : "";
  return `tested ${timeAgo(test.testedAt)}${through}`;
}

function useModelTest() {
  const form = useFormContext();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const test = async () => {
    const { model, gateway } = form.values as {
      model: string;
      gateway: string;
    };
    setBusy(true);
    try {
      const lastTest = await orpc.admin.agentConfig.testModel.call({
        model,
        gateway,
      });
      queryClient.setQueryData(
        orpc.admin.agentConfig.get.queryKey(),
        (config: AgentConfig | undefined) => config && { ...config, lastTest },
      );
    } catch (err) {
      form.setFieldError("model", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { test, busy };
}
