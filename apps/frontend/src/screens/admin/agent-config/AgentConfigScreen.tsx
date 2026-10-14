import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AgentConfig } from "@lib/contract";
import { orpc } from "../../../logic/api/orpc";
import { ModelCard } from "./ModelCard";
import { ProcessingCard } from "./ProcessingCard";
import { PromptSection } from "./PromptSection";

// Everything about how agents work here, one section each: who groups their
// pull requests and with which model, what an agent reads when it starts,
// and the prompt that processes a pull request.
export const AgentConfigScreen = () => {
  const { data, error } = useQuery(orpc.admin.agentConfig.get.queryOptions());
  if (error) {
    throw error;
  }
  return data ? <AgentConfigSections config={data} /> : null;
};

const AgentConfigSections = ({ config }: { config: AgentConfig }) => {
  const mode = useChosenMode(config);
  return (
    <Stack gap={16}>
      <ProcessingCard config={config} onModeChange={mode.set} />
      <ModelCard config={config} />
      <PromptSection which="sessionPrompt" />
      <PromptSection which="processingPrompt" mode={mode.chosen} />
    </Stack>
  );
};

// The way of processing chosen on the page, saved or not; back to the saved
// one whenever the config is saved.
function useChosenMode(config: AgentConfig) {
  const [chosen, set] = useState(config.processing);
  useEffect(() => set(config.processing), [config.updatedAt]);
  return { chosen, set };
}
