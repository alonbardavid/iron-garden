import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { agentConfigInputSchema, type AgentConfig } from "@lib/contract";
import { GENERAL_ERROR_KEY, useForm } from "@lib/ds";
import { orpc } from "../../../logic/api/orpc";
import { errorMessage } from "../../../logic/api/errors";

type Values = Pick<
  AgentConfig,
  "processing" | "model" | "maxTranscriptWords"
> & { gateway: string };

/**
 * A form over the whole agent config, starting from what is saved. Each card
 * shows some of its fields; the rest go back as saved, so one card's edits
 * never ride along with another card's Save.
 */
export function useAgentConfigForm(
  config: AgentConfig,
  onValuesChange?: (values: Values) => void,
) {
  const queryClient = useQueryClient();
  const saved: Values = {
    processing: config.processing,
    model: config.model,
    gateway: config.gateway ?? "",
    maxTranscriptWords: config.maxTranscriptWords,
  };
  const form = useForm<Values>({
    initialValues: saved,
    schema: agentConfigInputSchema,
    validateInputOnBlur: true,
    onValuesChange,
  });
  useEffect(() => {
    form.setInitialValues(saved);
    form.setValues(saved);
    form.resetTouched();
    // Only a saved config changes what the form starts from.
  }, [config.updatedAt]);
  const submit = async (values: Values) => {
    try {
      queryClient.setQueryData(
        orpc.admin.agentConfig.get.queryKey(),
        await orpc.admin.agentConfig.set.call(values),
      );
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return { form, submit };
}
