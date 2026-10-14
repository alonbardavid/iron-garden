import { Stack, Text, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@lib/contract";
import {
  FormGeneralErrors,
  FormPasswordInput,
  FormSubmitButton,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { AuthCard } from "../../components/layouts/UnauthenticatedLayout";
import { changePassword } from "../../logic/authentication/client";
import { useLogout } from "../../logic/authentication/useLogout";

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Use at least ${MIN_PASSWORD_LENGTH} characters`,
      ),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    error: "The passwords do not match",
  });

// Forced after signing in with a temporary password.
export const NewPasswordScreen = () => {
  const queryClient = useQueryClient();
  const logout = useLogout();
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
    await queryClient.invalidateQueries();
  };
  return (
    <AuthCard
      footer={
        <Text
          span
          size="sm"
          c="brand"
          style={{ cursor: "pointer" }}
          onClick={logout}
        >
          Sign out
        </Text>
      }
    >
      <StandardForm form={form} onSubmit={submit}>
        <Stack gap="md">
          <div>
            <Title order={2} fz={20}>
              Choose a new password
            </Title>
            <Text size="sm" mt={4}>
              You signed in with a temporary password. Choose your own to
              continue.
            </Text>
          </div>
          <FormPasswordInput
            name="currentPassword"
            label="Temporary password"
            autoComplete="current-password"
            autoFocus
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
          <FormSubmitButton fullWidth>Save and continue</FormSubmitButton>
        </Stack>
      </StandardForm>
    </AuthCard>
  );
};
