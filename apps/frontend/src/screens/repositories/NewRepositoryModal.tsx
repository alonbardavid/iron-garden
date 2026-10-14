import { Group, Modal, SegmentedControl, Stack } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { NAME_RULE, nameSchema, type Repository } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { GithubRepositorySelect } from "../../components/GithubRepositorySelect";
import { GithubTokenSelect } from "../../components/GithubTokenSelect";
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { parseGithubRepository } from "../../logic/github";

const SOURCES = [
  { label: "Empty", value: "empty" },
  { label: "Import from GitHub", value: "github" },
];

export const NewRepositoryModal = ({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) => {
  const [source, setSource] = useState("empty");
  const created = useRepositoryCreated(onClose);
  return (
    <Modal opened={opened} onClose={onClose} title="New repository" centered>
      <Stack>
        <SegmentedControl data={SOURCES} value={source} onChange={setSource} />
        {source === "empty" ? (
          <EmptyRepositoryForm onCreated={created} />
        ) : (
          <ImportRepositoryForm onCreated={created} />
        )}
      </Stack>
    </Modal>
  );
};

const emptySchema = z.object({
  name: nameSchema,
  description: z.string().max(500),
  defaultBranch: z.string().trim().min(1, "Name the default branch"),
});

const EmptyRepositoryForm = ({
  onCreated,
}: {
  onCreated: (repo: Repository) => Promise<void>;
}) => {
  const form = useForm({
    initialValues: { name: "", description: "", defaultBranch: "main" },
    schema: emptySchema,
    validateInputOnBlur: true,
  });
  const submit = async (values: typeof form.values) => {
    try {
      await onCreated(
        await orpc.repositories.create.call({
          name: values.name,
          description: values.description.trim() || null,
          defaultBranch: values.defaultBranch.trim(),
        }),
      );
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <FormTextInput
          name="name"
          label="Name"
          description={NAME_RULE}
          data-autofocus
        />
        <FormTextInput
          name="description"
          label="Description"
          placeholder="Optional"
        />
        <FormTextInput name="defaultBranch" label="Default branch" />
        <FormGeneralErrors />
        <Group justify="end">
          <FormSubmitButton>Create repository</FormSubmitButton>
        </Group>
      </Stack>
    </StandardForm>
  );
};

const importSchema = z.object({
  tokenId: z.string({ error: "Pick a token" }).min(1, "Pick a token"),
  repository: z
    .string()
    .refine((value) => parseGithubRepository(value) !== null, {
      message: "Pick a repository",
    }),
  name: nameSchema,
});

const ImportRepositoryForm = ({
  onCreated,
}: {
  onCreated: (repo: Repository) => Promise<void>;
}) => {
  const form = useForm({
    initialValues: { tokenId: "", repository: "", name: "" },
    schema: importSchema,
  });
  form.watch("repository", (picked) => suggestName(form, picked));
  const submit = async (values: typeof form.values) => {
    try {
      await onCreated(
        await orpc.repositories.import.call({
          ...parseGithubRepository(values.repository)!,
          tokenId: values.tokenId,
          name: values.name,
        }),
      );
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <GithubTokenSelect />
        <GithubRepositorySelect />
        <FormTextInput name="name" label="Name" description={NAME_RULE} />
        <FormGeneralErrors />
        <Group justify="end">
          <FormSubmitButton>Import repository</FormSubmitButton>
        </Group>
      </Stack>
    </StandardForm>
  );
};

// Names the new repository after the picked GitHub one until the person
// types a name of their own.
function suggestName(
  form: {
    values: { name: string };
    setFieldValue: (field: "name", value: string) => void;
  },
  picked: { value: string; previousValue: string },
) {
  const name = form.values.name;
  if (name === "" || name === nameFor(picked.previousValue)) {
    form.setFieldValue("name", nameFor(picked.value));
  }
}

function nameFor(repository: string): string {
  const parsed = parseGithubRepository(repository);
  return parsed ? parsed.repo.toLowerCase().replace(/[^a-z0-9-]/g, "-") : "";
}

function useRepositoryCreated(onClose: () => void) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (repo: Repository) => {
    await queryClient.invalidateQueries({ queryKey: orpc.repositories.key() });
    onClose();
    navigate(`/r/${repo.name}`);
  };
}
