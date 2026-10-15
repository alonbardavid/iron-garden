import { Group, Stack } from "@mantine/core";
import type { AgentConfig } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormSwitch,
  StandardForm,
} from "@lib/ds";
import { Card } from "../../../components/Card";
import { useAgentConfigForm } from "./useAgentConfigForm";

// Whether agent sessions may talk to each other.
export const SessionsCard = ({ config }: { config: AgentConfig }) => {
  const { form, submit } = useAgentConfigForm(config);
  return (
    <Card
      title="Sessions"
      description="Agent sessions on the same repository see each other on its Sessions page, and are told when they collide on a file a rule marks exclusive."
    >
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormSwitch
            name="sessionMessaging"
            label="Sessions can talk to each other"
            description="A session may message another session of the same repository through this server, and publish a contact others can reach it at. Off, messages are refused, contacts are kept but not shown, and new session prompts leave the section out."
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
