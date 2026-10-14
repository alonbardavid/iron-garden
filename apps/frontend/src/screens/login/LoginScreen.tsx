import { Anchor, Stack, Text, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { AuthCard } from "../../components/layouts/UnauthenticatedLayout";
import { signIn } from "../../logic/authentication/client";
import { useCapabilities } from "../../logic/capabilities/useCapabilities";

const schema = z.object({
  login: z.string().trim().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
});

export const LoginScreen = () => {
  const emailEnabled = useCapabilities().capabilities?.email ?? false;
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { login: "", password: "" },
    schema,
    validateInputOnBlur: true,
  });

  const submit = async ({ login, password }: typeof form.values) => {
    const { error } = login.includes("@")
      ? await signIn.email({ email: login.trim(), password })
      : await signIn.username({
          username: login.trim().toLowerCase(),
          password,
        });
    if (error) {
      form.setFieldError(
        GENERAL_ERROR_KEY,
        "Wrong username, email or password",
      );
      return;
    }
    await queryClient.invalidateQueries();
  };

  return (
    <AuthCard>
      <StandardForm form={form} onSubmit={submit}>
        <Stack gap="md">
          <Title order={2} fz={20}>
            Sign in
          </Title>
          <FormTextInput
            name="login"
            label="Username or email"
            autoComplete="username"
            autoFocus
          />
          <FormPasswordInput
            name="password"
            label="Password"
            autoComplete="current-password"
          />
          <FormGeneralErrors />
          <FormSubmitButton fullWidth>Sign in</FormSubmitButton>
          {emailEnabled ? (
            <Anchor
              component={Link}
              to="/forgot-password"
              size="sm"
              ta="center"
            >
              Forgot password?
            </Anchor>
          ) : (
            <Text size="sm" c="dimmed" ta="center">
              Forgot your password? Ask an admin for a temporary one.
            </Text>
          )}
        </Stack>
      </StandardForm>
    </AuthCard>
  );
};
