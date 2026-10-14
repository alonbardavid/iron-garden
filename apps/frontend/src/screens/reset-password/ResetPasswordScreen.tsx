import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Anchor, Box, Paper, Stack, Text, Title } from "@mantine/core";
import { z } from "zod";
import {
  FormGeneralErrors,
  FormPasswordInput,
  FormSubmitButton,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { MIN_PASSWORD_LENGTH } from "@lib/contract";
import { resetPassword } from "../../logic/authentication/client";

const schema = z.object({
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

export const ResetPasswordScreen = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const tokenError = searchParams.get("error");
  // An emailed invite lands here too: the user sets their first password.
  const invite = searchParams.get("invite") === "1";
  const [done, setDone] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm({
    initialValues: { password: "" },
    schema,
    validateInputOnBlur: true,
  });

  const handleSubmit = async (values: typeof form.values) => {
    if (!token) {
      form.setFieldError(GENERAL_ERROR_KEY, INVALID_LINK_MESSAGE);
      return;
    }
    const { error } = await resetPassword({
      newPassword: String(values.password),
      token,
    });
    if (error) {
      form.setFieldError(
        GENERAL_ERROR_KEY,
        error.message ?? "Could not reset your password",
      );
      return;
    }
    if (invite) {
      // Redeeming an invite signs the user in; loading them leaves this screen.
      await queryClient.invalidateQueries();
    }
    setDone(true);
  };

  return (
    <Box style={centeredBox}>
      <Paper withBorder shadow="xs" radius="md" p="xl" w="100%" maw={380}>
        {done ? (
          <SuccessMessage invite={invite} />
        ) : !token || tokenError ? (
          <InvalidLinkMessage />
        ) : (
          <StandardForm form={form} onSubmit={handleSubmit}>
            <Stack gap="md">
              <Title order={2} ta="center">
                {invite ? "Choose your password" : "Choose a new password"}
              </Title>
              <FormPasswordInput
                name="password"
                label="New password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                autoFocus
              />
              <FormGeneralErrors />
              <FormSubmitButton>
                {invite ? "Set password" : "Reset password"}
              </FormSubmitButton>
            </Stack>
          </StandardForm>
        )}
      </Paper>
    </Box>
  );
};

const SuccessMessage = ({ invite }: { invite: boolean }) => {
  return (
    <Stack gap="md" ta="center">
      <Title order={2}>{invite ? "Password set" : "Password updated"}</Title>
      <Text c="dimmed">
        {invite
          ? "Your account is ready. Sign in with your username or email and your new password."
          : "Your password has been reset. You can now sign in with your new password."}
      </Text>
      <Anchor component={Link} to="/">
        Go to sign in
      </Anchor>
    </Stack>
  );
};

const InvalidLinkMessage = () => {
  return (
    <Stack gap="md" ta="center">
      <Title order={2}>Link expired</Title>
      <Text c="dimmed">{INVALID_LINK_MESSAGE}</Text>
      <Anchor component={Link} to="/forgot-password">
        Request a new link
      </Anchor>
    </Stack>
  );
};

const INVALID_LINK_MESSAGE =
  "This password reset link is invalid or has expired. Request a new one to continue.";

const centeredBox = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
};
