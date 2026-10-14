import {
  ActionIcon,
  Anchor,
  Button,
  Code,
  Group,
  List,
  Modal,
  Radio,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import type { EmailSettings } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { Card } from "../../components/Card";
import { InfoIcon } from "../../components/icons";
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { useSignedInMe } from "../../logic/authentication/useMe";
import { SkeletonCards } from "../../components/skeletons";

const schema = z
  .object({
    enabled: z.enum(["enabled", "disabled"]),
    sender: z.string().trim(),
  })
  .refine(
    (v) => v.enabled === "disabled" || z.email().safeParse(v.sender).success,
    {
      path: ["sender"],
      error: "Enter a valid email address",
    },
  );

export const EmailScreen = () => {
  const { data } = useQuery(orpc.admin.email.get.queryOptions());
  return data ? (
    <EmailSendingCard settings={data} />
  ) : (
    <SkeletonCards count={1} />
  );
};

const EmailSendingCard = ({ settings }: { settings: EmailSettings }) => {
  const me = useSignedInMe();
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const form = useForm({
    initialValues: {
      enabled: settings.enabled ? "enabled" : "disabled",
      sender: settings.sender ?? "",
    },
    schema,
  });
  const enabled = form.values.enabled === "enabled";
  const senderValid = z.email().safeParse(form.values.sender.trim()).success;

  const save = async (values: typeof form.values) => {
    try {
      const saved = await orpc.admin.email.set.call({
        enabled: values.enabled === "enabled",
        sender: values.sender.trim() || null,
      });
      queryClient.setQueryData(orpc.admin.email.get.queryKey(), saved);
      await queryClient.invalidateQueries({
        queryKey: orpc.capabilities.get.queryKey(),
      });
      notifications.show({ color: "green", message: "Email settings saved" });
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { error } = await orpc.admin.email.test.call({
        sender: form.values.sender.trim(),
      });
      if (error) {
        form.setFieldError("sender", error);
      } else {
        notifications.show({
          color: "green",
          message: `Test email sent to ${me.email}`,
        });
      }
    } catch (err) {
      form.setFieldError("sender", errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title="Email sending"
      description="With email sending on, new users get an invite and everyone can reset their own password from a link. Without it you hand out temporary passwords."
    >
      <StandardForm form={form} onSubmit={save}>
        <Stack gap={16}>
          <Radio.Group
            aria-label="Email sending"
            {...form.getInputProps("enabled")}
          >
            <Stack gap={12}>
              <Radio value="disabled" label="Disabled" />
              <Radio value="enabled" label="Enabled" />
            </Stack>
          </Radio.Group>
          {/* Indented under the Enabled radio, past its button and gap. */}
          <Group gap={8} wrap="nowrap" align="end" maw={552} pl={32} mt={-4}>
            <FormTextInput
              name="sender"
              label="Sender email"
              placeholder="git@example.com"
              disabled={!enabled}
              flex={1}
            />
            <Button
              variant="default"
              onClick={sendTest}
              loading={testing}
              disabled={!enabled || !senderValid}
            >
              Send test email
            </Button>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={36}
              aria-label="How to set up a sending domain"
              onClick={() => setHelpOpen(true)}
            >
              <InfoIcon size={18} />
            </ActionIcon>
          </Group>
          <FormGeneralErrors />
          <Group>
            <FormSubmitButton>Save</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
      <DomainHelpModal opened={helpOpen} onClose={() => setHelpOpen(false)} />
    </Card>
  );
};

const DomainHelpModal = ({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) => (
  <Modal
    opened={opened}
    onClose={onClose}
    title="Set up a sending domain"
    centered
    size="lg"
  >
    <Stack gap={12}>
      <Text size="sm">
        Mail is sent through Cloudflare Email Service, so the sender has to be
        on a domain you have onboarded there. The domain must use Cloudflare
        DNS, and sending needs the Workers Paid plan.
      </Text>
      <List type="ordered" size="sm" spacing={8}>
        <List.Item>
          In the Cloudflare dashboard open{" "}
          <Anchor
            inherit
            href="https://dash.cloudflare.com/?to=/:account/email-service/sending"
            target="_blank"
            rel="noreferrer"
          >
            Compute › Email Service › Email Sending
          </Anchor>{" "}
          and select <b>Onboard Domain</b>.
        </List.Item>
        <List.Item>
          Choose your domain. Cloudflare adds the records it needs (MX, SPF and
          DKIM on <Code>cf-bounce</Code>, and DMARC) for you; they usually take
          a few minutes to apply.
        </List.Item>
        <List.Item>
          Back here, choose <b>Enabled</b>, enter an address on that domain such
          as <Code>noreply@yourdomain.com</Code>, and send a test email. Save
          once it arrives.
        </List.Item>
      </List>
      <Text size="sm" c="dimmed">
        More in{" "}
        <Anchor
          inherit
          href="https://developers.cloudflare.com/email-service/get-started/send-emails/"
          target="_blank"
          rel="noreferrer"
        >
          Cloudflare&apos;s Email Sending guide
        </Anchor>
        .
      </Text>
      <Group justify="end">
        <Button onClick={onClose}>Done</Button>
      </Group>
    </Stack>
  </Modal>
);
