import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Card } from "../../../components/Card";
import { orpc } from "../../../logic/api/orpc";
import { errorMessage } from "../../../logic/api/errors";
import { useRepository } from "../RepositoryLayout";

const schema = z.object({
  name: nameSchema,
  description: z.string().max(500),
  defaultBranch: z.string().trim().min(1, "Name the default branch"),
});

export const GeneralSettingsScreen = () => (
  <Stack gap={16}>
    <GeneralCard />
    <DeleteCard />
  </Stack>
);

const GeneralCard = () => {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    initialValues: {
      name: repository.name,
      description: repository.description ?? "",
      defaultBranch: repository.defaultBranch,
    },
    schema,
    validateInputOnBlur: true,
  });
  const submit = async (values: typeof form.values) => {
    try {
      const updated = await orpc.repositories.update.call({
        name: repository.name,
        newName: values.name,
        description: values.description.trim() || null,
        defaultBranch: values.defaultBranch.trim(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.repositories.key(),
      });
      form.resetDirty();
      if (updated.name !== repository.name) {
        navigate(`/r/${updated.name}/settings`, { replace: true });
      }
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <Card title="General">
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormTextInput
            name="name"
            label="Name"
            description={`Renaming changes the clone URL. ${NAME_RULE}.`}
          />
          <FormTextInput name="description" label="Description" />
          <FormTextInput name="defaultBranch" label="Default branch" />
          <FormGeneralErrors />
          <Group>
            <FormSubmitButton>Save</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Card>
  );
};

const DeleteCard = () => {
  const { name } = useRepository();
  const [open, setOpen] = useState(false);
  return (
    <Card
      title="Delete this repository"
      description="Deletes its git data, sessions and pull requests for everyone. This cannot be undone."
    >
      <Group>
        <Button color="red" variant="outline" onClick={() => setOpen(true)}>
          Delete repository
        </Button>
      </Group>
      <DeleteModal name={name} opened={open} onClose={() => setOpen(false)} />
    </Card>
  );
};

const DeleteModal = ({
  name,
  opened,
  onClose,
}: {
  name: string;
  opened: boolean;
  onClose: () => void;
}) => {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = async () => {
    setBusy(true);
    try {
      await orpc.repositories.delete.call({ name });
      await queryClient.invalidateQueries({
        queryKey: orpc.repositories.key(),
      });
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title={`Delete ${name}`} centered>
      <Stack>
        <Text size="sm">Type the repository's name to confirm.</Text>
        <TextInput
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          placeholder={name}
          data-autofocus
        />
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Group justify="end">
          <Button
            color="red"
            disabled={typed !== name}
            loading={busy}
            onClick={remove}
          >
            Delete repository
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
