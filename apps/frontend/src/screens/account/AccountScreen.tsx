import { Group, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  FormGeneralErrors,
  FormPasswordInput,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { MIN_PASSWORD_LENGTH } from "@lib/contract";
import { Card } from "../../components/Card";
import { authClient, changePassword } from "../../logic/authentication/client";
import { useSignedInMe } from "../../logic/authentication/useMe";
import { orpc } from "../../logic/api/orpc";
import { passwordChangeSchema } from "../password/NewPasswordScreen";

export const AccountScreen = () => (
  <Stack gap={16}>
    <ProfileCard />
    <PasswordCard />
  </Stack>
);

const ProfileCard = () => {
  const me = useSignedInMe();
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { name: me.name },
    schema: z.object({ name: z.string().trim().min(1, "Enter your name") }),
  });
  const submit = async ({ name }: typeof form.values) => {
    const { error } = await authClient.updateUser({ name: name.trim() });
    if (error) {
      form.setFieldError(GENERAL_ERROR_KEY, error.message ?? "Could not save");
      return;
    }
    form.resetDirty();
    await queryClient.invalidateQueries({ queryKey: orpc.me.key() });
    notifications.show({ message: "Profile saved" });
  };
  return (
    <Card title="Profile">
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormTextInput name="name" label="Name" />
          <TextInput
            label="Username"
            value={me.username ?? ""}
            readOnly
            disabled
            description="What git and agents know you as."
          />
          <TextInput
            label="Email"
            value={me.email}
            readOnly
            disabled
            description="Only an admin can change your email."
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

const PasswordCard = () => {
  const form = useForm({
    initialValues: { currentPassword: "", newPassword: "", confirm: "" },
    schema: passwordChangeSchema,
    validateInputOnBlur: true,
  });
  const submit = async (values: typeof form.values) => {
    const { error } = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      form.setFieldError(
        GENERAL_ERROR_KEY,
        error.message ?? "Could not change the password",
      );
      return;
    }
    form.reset();
    notifications.show({
      message: "Password changed. Other sessions were signed out.",
    });
  };
  return (
    <Card title="Password">
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <FormPasswordInput
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
          />
          <FormPasswordInput
            name="newPassword"
            label="New password"
            description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            autoComplete="new-password"
          />
          <FormPasswordInput
            name="confirm"
            label="Confirm new password"
            autoComplete="new-password"
          />
          <FormGeneralErrors />
          <Group>
            <FormSubmitButton>Change password</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Card>
  );
};
