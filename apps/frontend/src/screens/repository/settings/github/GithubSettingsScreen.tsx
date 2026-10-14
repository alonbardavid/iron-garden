import { Anchor, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { z } from "zod";
import type { GithubConnection } from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { Card } from "../../../../components/Card";
import { GithubRepositorySelect } from "../../../../components/GithubRepositorySelect";
import { GithubTokenSelect } from "../../../../components/GithubTokenSelect";
import { errorMessage } from "../../../../logic/api/errors";
import { parseGithubRepository } from "../../../../logic/github";
import { timeAgo } from "../../../../logic/time";
import { useRepository } from "../../RepositoryLayout";
import { TokenCard } from "./TokenCard";
import { useGithubActions, useGithubConnection } from "./useGithub";
import { WebhookCard } from "./WebhookCard";
import { SkeletonCards } from "../../../../components/skeletons";

export const GithubSettingsScreen = () => {
  const { name } = useRepository();
  const { data: connection, isLoading } = useGithubConnection(name);
  if (isLoading) {
    return <SkeletonCards count={2} />;
  }
  return connection ? (
    <ConnectedSettings connection={connection} />
  ) : (
    <ConnectCard />
  );
};

const ConnectedSettings = ({
  connection,
}: {
  connection: GithubConnection;
}) => (
  <Stack gap={16}>
    <ConnectionCard connection={connection} />
    <TokenCard connection={connection} />
    <WebhookCard connection={connection} />
    <DisconnectCard />
  </Stack>
);

const connectSchema = z.object({
  tokenId: z.string({ error: "Pick a token" }).min(1, "Pick a token"),
  repository: z
    .string()
    .refine((value) => parseGithubRepository(value) !== null, {
      message: "Pick a repository",
    }),
});

const ConnectCard = () => {
  const { name } = useRepository();
  const { connect } = useGithubActions(name);
  const form = useForm({
    initialValues: { tokenId: "", repository: "" },
    schema: connectSchema,
  });
  const submit = async (values: typeof form.values) => {
    try {
      await connect({
        ...parseGithubRepository(values.repository)!,
        tokenId: values.tokenId,
      });
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <Card
      title="GitHub"
      description="Mirror a GitHub repository here: its branches are copied now and kept up to date, and its workflow runs and artifacts show under Workflows. GitHub stays the source of truth for the branches it has."
    >
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <GithubTokenSelect />
          <GithubRepositorySelect />
          <FormGeneralErrors />
          <Group>
            <FormSubmitButton>Connect and sync</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Card>
  );
};

const ConnectionCard = ({ connection }: { connection: GithubConnection }) => {
  const { name } = useRepository();
  const { sync } = useGithubActions(name);
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    await sync().finally(() => setSyncing(false));
  };
  return (
    <Card
      title={
        <Group justify="space-between">
          <span>
            Mirroring{" "}
            <Anchor href={connection.htmlUrl} target="_blank" rel="noreferrer">
              {connection.owner}/{connection.repo}
            </Anchor>
          </span>
          <Button variant="default" loading={syncing} onClick={syncNow}>
            Sync now
          </Button>
        </Group>
      }
    >
      <SyncState connection={connection} />
    </Card>
  );
};

const NOT_SYNCED = { color: "gray", label: "Not synced" } as const;

const SYNC_BADGES = {
  idle: { color: "green", label: "Up to date" },
  syncing: { color: "blue", label: "Syncing" },
  failed: { color: "red", label: "Sync failed" },
} as const;

const SyncState = ({ connection }: { connection: GithubConnection }) => {
  const badge =
    connection.syncStatus === "idle" && !connection.lastSyncedAt
      ? NOT_SYNCED
      : SYNC_BADGES[connection.syncStatus];
  return (
    <Stack gap={6}>
      <Group gap={8}>
        <Badge variant="light" color={badge.color}>
          {badge.label}
        </Badge>
        <Text size="sm" c="dimmed">
          {connection.lastSyncedAt
            ? `Last synced ${timeAgo(connection.lastSyncedAt)}`
            : "Never synced"}
        </Text>
      </Group>
      {connection.syncStatus === "failed" && (
        <Text size="sm" c="red">
          {connection.lastSyncError}
        </Text>
      )}
    </Stack>
  );
};

const DisconnectCard = () => {
  const { name } = useRepository();
  const { disconnect } = useGithubActions(name);
  return (
    <Card
      title="Disconnect"
      description="Stops mirroring and forgets the workflow runs. The branches already copied stay; remove the webhook on GitHub if you added it by hand."
    >
      <Group>
        <Button color="red" variant="outline" onClick={disconnect}>
          Disconnect from GitHub
        </Button>
      </Group>
    </Card>
  );
};
