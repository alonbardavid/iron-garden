import { Group, Stack } from "@mantine/core";
import type { AgentConfig } from "@lib/contract";
import {
  FormGeneralErrors,
  FormNumberInput,
  FormSubmitButton,
  FormTextInput,
  StandardForm,
} from "@lib/ds";
import { Card } from "../../../components/Card";
import { ModelField } from "./ModelField";
import { LastModelTest, TestModelButton } from "./ModelTest";
import { useAgentConfigForm } from "./useAgentConfigForm";

// The model the server asks when it processes pull requests.
export const ModelCard = ({ config }: { config: AgentConfig }) => {
  const { form, submit } = useAgentConfigForm(config);
  return (
    <Card
      title="Model"
      description="The model this server asks when it processes pull requests or answers ad hoc questions."
    >
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <ModelField config={config} />
          <FormTextInput
            name="gateway"
            label="AI Gateway"
            placeholder={config.defaultGateway}
            description={`The AI Gateway model calls go through, for logs, caching and rate limits. Leave it empty for ${config.defaultGateway}, which is created on first use.`}
          />
          <FormNumberInput
            name="maxTranscriptWords"
            label="Transcript limit"
            suffix=" words"
            min={0}
            step={1000}
            thousandSeparator=","
            allowDecimal={false}
            description={`The most words of the agent's transcripts the model gets with a pull request, the latest ones, when it brackets it or answers about it. 0 sends none. Default: ${config.defaultMaxTranscriptWords.toLocaleString("en-US")}.`}
          />
          <FormGeneralErrors />
          <Group>
            <FormSubmitButton>Save</FormSubmitButton>
            <TestModelButton config={config} />
          </Group>
          <LastModelTest test={config.lastTest} />
        </Stack>
      </StandardForm>
    </Card>
  );
};
