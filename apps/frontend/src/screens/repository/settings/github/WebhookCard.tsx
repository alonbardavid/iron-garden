import { Button, Group, List, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { GithubConnection } from "@lib/contract";
import { Card } from "../../../../components/Card";
import { CopyField } from "../../../../components/CopyField";
import { DoneMark } from "../../../../components/DoneMark";
import { orpc } from "../../../../logic/api/orpc";
import { errorMessage } from "../../../../logic/api/errors";
import { timeAgo } from "../../../../logic/time";
import { useRepository } from "../../RepositoryLayout";
import { useGithubActions, useWebhookAccess } from "./useGithub";

// GitHub tells the repository about pushes, pull requests and workflow runs
// through a webhook: one the instance creates when the token may, or one a
// person adds by hand.
export const WebhookCard = ({
  connection,
}: {
  connection: GithubConnection;
}) => (
  <Card
    title={
      <Group gap={8}>
        Webhook
        {isConnected(connection) && <DoneMark label="Webhook connected" />}
      </Group>
    }
    description={deliveryNote(connection)}
  >
    <WebhookState connection={connection} />
  </Card>
);

const WebhookState = ({ connection }: { connection: GithubConnection }) => {
  if (connection.webhook === "automatic") {
    return <CreatedWebhook />;
  }
  if (connection.webhookDeliveredAt) {
    return <ManualWebhook connection={connection} />;
  }
  return (
    <Stack gap={14}>
      <SetUpWebhook />
      <ManualWebhook connection={connection} />
    </Stack>
  );
};

const CreatedWebhook = () => {
  const { name } = useRepository();
  const { removeWebhook } = useGithubActions(name);
  const remove = useAction(removeWebhook);
  return (
    <Stack gap={6}>
      <Text size="sm">
        The webhook was created on GitHub: pushes, pull requests and workflow
        runs reach this repository as they happen.
      </Text>
      <Group>
        <Button
          variant="outline"
          color="red"
          onClick={remove.run}
          loading={remove.busy}
        >
          Remove webhook from GitHub
        </Button>
      </Group>
      <ActionError error={remove.error} />
    </Stack>
  );
};

// Offered only when the token looks able to create the hook; otherwise says
// what it lacks.
const SetUpWebhook = () => {
  const { name } = useRepository();
  const { data: access, error } = useWebhookAccess(name);
  if (!access) {
    return <ActionError error={error ? errorMessage(error) : null} />;
  }
  return access.allowed ? (
    <SetUpWebhookButton />
  ) : (
    <Text size="sm" c="dimmed">
      This instance cannot create the webhook for you: {access.reason}
    </Text>
  );
};

const SetUpWebhookButton = () => {
  const { name } = useRepository();
  const { setUpWebhook } = useGithubActions(name);
  const setUp = useAction(setUpWebhook);
  return (
    <Stack gap={6}>
      <Group>
        <Button onClick={setUp.run} loading={setUp.busy}>
          Set up webhook on GitHub
        </Button>
      </Group>
      <ActionError error={setUp.error} />
    </Stack>
  );
};

const ManualWebhook = ({ connection }: { connection: GithubConnection }) => (
  <Stack gap={10}>
    <Text size="sm">
      To add it by hand, use the GitHub repository's Settings › Webhooks:
    </Text>
    <CopyField label="Payload URL" value={connection.webhookUrl} />
    <List size="sm" spacing={2}>
      <List.Item>Content type: application/json</List.Item>
      <List.Item>Events: pushes, pull requests and workflow runs</List.Item>
    </List>
    <WebhookSecret />
  </Stack>
);

const WebhookSecret = () => {
  const { name } = useRepository();
  const [secret, setSecret] = useState<string | null>(null);
  const reveal = async () =>
    setSecret(
      (await orpc.repositories.github.webhookSecret.call({ name })).secret,
    );
  return secret ? (
    <CopyField label="Secret" value={secret} />
  ) : (
    <Group>
      <Button variant="default" onClick={reveal}>
        Show secret
      </Button>
    </Group>
  );
};

const ActionError = ({ error }: { error: string | null }) =>
  error && (
    <Text size="sm" c="red" role="alert">
      {error}
    </Text>
  );

function useAction(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    await action()
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };
  return { run, busy, error };
}

function deliveryNote(connection: GithubConnection): string {
  return connection.webhookDeliveredAt
    ? `GitHub last delivered an event ${timeAgo(connection.webhookDeliveredAt)}.`
    : "No event from GitHub yet.";
}

function isConnected(connection: GithubConnection): boolean {
  return (
    connection.webhook === "automatic" || connection.webhookDeliveredAt !== null
  );
}
