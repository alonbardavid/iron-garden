import { Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AgentConfig, ModelOption } from "@lib/contract";
import { FormAutocomplete, useFormContext } from "@lib/ds";
import { orpc } from "../../../logic/api/orpc";

// How long typing pauses before the models are searched.
const SEARCH_DELAY_MS = 250;

// The model id, completed from the Workers AI models whose names hold the
// words typed so far. Any id can still be typed, such as a provider's model
// routed through the gateway.
export const ModelField = ({ config }: { config: AgentConfig }) => {
  const options = useModelOptions(config.serverAvailable);
  const described = new Map(options.map((o) => [o.name, o.description]));
  return (
    <FormAutocomplete
      name="model"
      label="Model"
      description={`A Workers AI model id, or a provider's model routed through the gateway. Default: ${config.defaultModel}.`}
      data={options.map((o) => o.name)}
      filter={({ options: all }) => all}
      renderOption={({ option }) => (
        <ModelOptionRow
          name={option.value}
          description={described.get(option.value)}
        />
      )}
      maxDropdownHeight={320}
    />
  );
};

const ModelOptionRow = ({
  name,
  description,
}: {
  name: string;
  description: string | undefined;
}) => (
  <Stack gap={0}>
    <Text size="sm" ff="monospace">
      {name}
    </Text>
    <Text size="xs" c="dimmed" lineClamp={1}>
      {description}
    </Text>
  </Stack>
);

// The models matching what is in the field, searched once typing pauses.
function useModelOptions(available: boolean): ModelOption[] {
  const form = useFormContext();
  const [query] = useDebouncedValue(
    String(form.values.model ?? "").trim(),
    SEARCH_DELAY_MS,
  );
  const { data = [] } = useQuery({
    ...orpc.admin.agentConfig.searchModels.queryOptions({ input: { query } }),
    enabled: available && query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  return data;
}
