import { Group, Modal, SegmentedControl, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { z } from "zod";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { errorMessage } from "../../logic/api/errors";

export interface NewKeyInput {
  name: string;
  expiresInDays: number | null;
}

const EXPIRY = [
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "Never", value: "never" },
];

const schema = z.object({ name: z.string().trim().min(1, "Name the key") });

export const NewKeyModal = ({
  opened,
  onClose,
  onCreate,
}: {
  opened: boolean;
  onClose: () => void;
  onCreate: (input: NewKeyInput) => Promise<void>;
}) => {
  const [expiry, setExpiry] = useState("90");
  const form = useForm({ initialValues: { name: "" }, schema });
  const submit = async (values: typeof form.values) => {
    try {
      await onCreate({
        name: values.name.trim(),
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      form.reset();
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="New key" centered>
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormTextInput
            name="name"
            label="Name"
            placeholder="laptop"
            data-autofocus
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Expires
            </Text>
            <SegmentedControl
              data={EXPIRY}
              value={expiry}
              onChange={setExpiry}
            />
          </Stack>
          <FormGeneralErrors />
          <Group justify="end">
            <FormSubmitButton>Create key</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Modal>
  );
};
