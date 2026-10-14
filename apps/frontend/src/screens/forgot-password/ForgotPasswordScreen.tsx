import { useState } from "react";
import { Link } from "react-router-dom";
import { Anchor, Box, Paper, Stack, Text, Title } from "@mantine/core";
import { z } from "zod";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { requestPasswordReset } from "../../logic/authentication/client";

const schema = z.object({
  email: z.email("Enter a valid email"),
});

export const ForgotPasswordScreen = () => {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const form = useForm({
    initialValues: { email: "" },
    schema,
    validateInputOnBlur: true,
  });

  const handleSubmit = async (values: typeof form.values) => {
    const { error } = await requestPasswordReset({
      email: String(values.email),
      redirectTo: "/reset-password",
    });
    if (error) {
      form.setFieldError(
        GENERAL_ERROR_KEY,
        error.message ?? "Could not send the reset email",
      );
      return;
    }
    setSubmittedEmail(String(values.email));
  };

  return (
    <Box style={centeredBox}>
      <Paper withBorder shadow="xs" radius="md" p="xl" w="100%" maw={380}>
        {submittedEmail ? (
          <CheckInboxMessage email={submittedEmail} />
        ) : (
          <StandardForm form={form} onSubmit={handleSubmit}>
            <Stack gap="md">
              <Title order={2} ta="center">
                Forgot your password?
              </Title>
              <Text ta="center" size="sm" c="dimmed">
                Enter your email and we&apos;ll send you a link to reset your
                password.
              </Text>
              <FormTextInput
                name="email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                autoFocus
              />
              <FormGeneralErrors />
              <FormSubmitButton>Send reset link</FormSubmitButton>
              <Text ta="center" size="sm" c="dimmed">
                Remembered it?{" "}
                <Anchor component={Link} to="/">
                  Sign in
                </Anchor>
              </Text>
            </Stack>
          </StandardForm>
        )}
      </Paper>
    </Box>
  );
};

const CheckInboxMessage = ({ email }: { email: string }) => {
  return (
    <Stack gap="md" ta="center">
      <Title order={2}>Check your inbox</Title>
      <Text c="dimmed">
        If an account exists for <strong>{email}</strong>, we sent a link to
        reset your password. Follow it to choose a new one.
      </Text>
      <Anchor component={Link} to="/">
        Back to sign in
      </Anchor>
    </Stack>
  );
};

const centeredBox = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
};
