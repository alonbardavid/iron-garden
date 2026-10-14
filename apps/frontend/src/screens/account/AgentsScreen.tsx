import { Badge, Button, Group, Modal, Stack, Table, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { NAME_RULE, nameSchema } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { Card } from "../../components/Card";
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { formatDate } from "../../logic/time";
import { SkeletonRows } from "../../components/skeletons";

export const AgentsScreen = () => {
  const [creating, setCreating] = useState(false);
  const { data: agents } = useQuery(orpc.agents.list.queryOptions());
  return (
    <Card
      title={
        <Group justify="space-between">
          Agents
          <Button onClick={() => setCreating(true)}>New agent</Button>
        </Group>
      }
      description="An agent is an identity of its own that acts for you: its keys open sessions and push, never with more access than you have."
    >
      {!agents && <SkeletonRows rows={3} />}
      {agents && agents.length === 0 && (
        <Text size="sm" c="dimmed">
          No agents yet.
        </Text>
      )}
      {agents && agents.length > 0 && (
        <Table verticalSpacing="sm">
          <Table.Tbody>
            {agents.map((agent) => (
              <Table.Tr key={agent.id}>
                <Table.Td>
                  <Text
                    component={Link}
                    to={`/account/agents/${agent.name}`}
                    fw={600}
                    size="sm"
                  >
                    {agent.name}
                  </Text>
                  {agent.description && (
                    <Text size="xs" c="dimmed">
                      {agent.description}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={agent.active ? "green" : "gray"}
                  >
                    {agent.active ? "Active" : "Deactivated"}
                  </Badge>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" c="dimmed">
                    Created {formatDate(agent.createdAt)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <NewAgentModal opened={creating} onClose={() => setCreating(false)} />
    </Card>
  );
};

const schema = z.object({ name: nameSchema, description: z.string().max(500) });

const NewAgentModal = ({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    initialValues: { name: "", description: "" },
    schema,
    validateInputOnBlur: true,
  });
  const submit = async (values: typeof form.values) => {
    try {
      const agent = await orpc.agents.create.call({
        name: values.name,
        description: values.description.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: orpc.agents.key() });
      navigate(`/account/agents/${agent.name}`);
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="New agent" centered>
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormTextInput
            name="name"
            label="Name"
            placeholder="deps-claude"
            description={`Unique on this instance. ${NAME_RULE}.`}
            data-autofocus
          />
          <FormTextInput
            name="description"
            label="Description"
            placeholder="Optional"
          />
          <FormGeneralErrors />
          <Group justify="end">
            <FormSubmitButton>Create agent</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Modal>
  );
};
