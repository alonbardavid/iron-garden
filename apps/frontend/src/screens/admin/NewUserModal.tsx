import { Group, Modal, SegmentedControl, Stack, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { authClient } from "../../logic/authentication/client";
import { useCapabilities } from "../../logic/capabilities/useCapabilities";
import { temporaryPassword } from "./TemporaryPasswordModal";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  username: nameSchema,
  email: z.email("Enter a valid email"),
});

export const NewUserModal = ({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  // Without a password, the user was invited by email.
  onCreated: (created: {
    username: string;
    email: string;
    password?: string;
  }) => void;
}) => {
  const queryClient = useQueryClient();
  const invite = useCapabilities().capabilities?.email ?? false;
  const [role, setRole] = useState<"user" | "admin">("user");
  const form = useForm({
    initialValues: { name: "", username: "", email: "" },
    schema,
    validateInputOnBlur: true,
  });
  const submit = async (values: typeof form.values) => {
    const password = invite ? undefined : temporaryPassword();
    const email = values.email.trim();
    const { error } = await authClient.admin.createUser({
      name: values.name.trim(),
      email,
      password,
      role,
      data: { username: values.username },
    });
    if (error) {
      form.setFieldError(
        GENERAL_ERROR_KEY,
        error.message ?? "Could not create the user",
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    form.reset();
    onCreated({ username: values.username, email, password });
  };
  return (
    <Modal opened={opened} onClose={onClose} title="New user" centered>
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormTextInput name="name" label="Name" data-autofocus />
          <FormTextInput
            name="username"
            label="Username"
            description={NAME_RULE}
          />
          <FormTextInput name="email" label="Email" type="email" />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Role
            </Text>
            <SegmentedControl
              data={[
                { value: "user", label: "User" },
                { value: "admin", label: "Admin" },
              ]}
              value={role}
              onChange={(v) => setRole(v as "user" | "admin")}
            />
          </Stack>
          <Text size="sm" c="dimmed">
            {invite
              ? "They get an email to choose their own password."
              : "They get a temporary password to change when they first sign in."}
          </Text>
          <FormGeneralErrors />
          <Group justify="end">
            <FormSubmitButton>Create user</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Modal>
  );
};
