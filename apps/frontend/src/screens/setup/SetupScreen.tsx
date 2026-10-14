import { Divider, Stack, Text, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  MIN_PASSWORD_LENGTH,
  MIN_SETUP_TOKEN_LENGTH,
  nameSchema,
  NAME_RULE,
} from "@lib/contract";
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
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { signIn } from "../../logic/authentication/client";

const schema = z.object({
  token: z.string().min(1, "Enter the setup token"),
  name: z.string().trim().min(1, "Enter your name"),
  username: nameSchema,
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

export const SetupScreen = () => {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      token: "",
      name: "",
      username: "",
      email: "",
      password: "",
    },
    schema,
    validateInputOnBlur: true,
  });
  const submit = async (values: typeof form.values) => {
    try {
      await orpc.setup.create.call(values);
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
      return;
    }
    await signIn.username({
      username: values.username,
      password: values.password,
    });
    await queryClient.invalidateQueries();
  };
  return (
    <AuthCard>
      <StandardForm form={form} onSubmit={submit}>
        <Stack gap="md">
          <div>
            <Title order={2} fz={20}>
              Set up this instance
            </Title>
            <Text size="sm" mt={4}>
              This page appears only until the first admin exists. Enter the
              setup token you gave the deploy, then create the admin account.
            </Text>
          </div>
          <FormTextInput
            name="token"
            label="Setup token"
            placeholder="The SETUP_TOKEN secret"
            autoFocus
          />
          <Divider />
          <FormTextInput name="name" label="Your name" />
          <FormTextInput
            name="username"
            label="Username"
            description={`What git and agents know you as: ${NAME_RULE}.`}
          />
          <FormTextInput name="email" label="Email" type="email" />
          <FormPasswordInput
            name="password"
            label="Password"
            description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          />
          <FormGeneralErrors />
          <FormSubmitButton fullWidth>
            Create the admin account and sign in
          </FormSubmitButton>
        </Stack>
      </StandardForm>
    </AuthCard>
  );
};

export const SetupUnconfiguredScreen = () => (
  <AuthCard>
    <Stack gap="xs">
      <Title order={2} fz={20}>
        Set up this instance
      </Title>
      <Text size="sm">
        This instance has no admin yet. Set the <code>SETUP_TOKEN</code> secret
        on the Worker (at least {MIN_SETUP_TOKEN_LENGTH} characters), then
        reload this page.
      </Text>
    </Stack>
  </AuthCard>
);
