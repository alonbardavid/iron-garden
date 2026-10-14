import { ActionIcon, Group, Modal, Stack, Text } from "@mantine/core";
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
import { DoneMark } from "../../../../components/DoneMark";
import { GithubTokenSelect } from "../../../../components/GithubTokenSelect";
import { EditIcon } from "../../../../components/icons";
import { errorMessage } from "../../../../logic/api/errors";
import { useRepository } from "../../RepositoryLayout";
import { useGithubActions } from "./useGithub";

// The token the connection reads GitHub with. Once there is one it is only
// named here; changing it happens in a modal.
export const TokenCard = ({ connection }: { connection: GithubConnection }) =>
  connection.token ? (
    <ConnectedToken connection={connection} token={connection.token} />
  ) : (
    <Card
      title="Token"
      description={
        <Text span c="red" size="sm">
          The token this repository used was deleted, so it no longer syncs.
          Pick one of your tokens to resume.
        </Text>
      }
    >
      <ChangeTokenForm connection={connection} />
    </Card>
  );

const ConnectedToken = ({
  connection,
  token,
}: {
  connection: GithubConnection;
  token: NonNullable<GithubConnection["token"]>;
}) => {
  const [editing, setEditing] = useState(false);
  return (
    <Card
      title={
        <Group gap={8}>
          Token
          <DoneMark label="Token connected" />
        </Group>
      }
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          Reads GitHub with {token.userName}'s token “{token.name}” (
          {token.githubLogin}).
        </Text>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Change token"
          onClick={() => setEditing(true)}
        >
          <EditIcon />
        </ActionIcon>
      </Group>
      <Modal
        opened={editing}
        onClose={() => setEditing(false)}
        title="Change token"
        centered
      >
        <ChangeTokenForm
          connection={connection}
          onChanged={() => setEditing(false)}
        />
      </Modal>
    </Card>
  );
};

const tokenSchema = z.object({
  tokenId: z.string({ error: "Pick a token" }).min(1, "Pick a token"),
});

const ChangeTokenForm = ({
  connection,
  onChanged,
}: {
  connection: GithubConnection;
  onChanged?: () => void;
}) => {
  const { name } = useRepository();
  const { connect } = useGithubActions(name);
  const form = useForm({ initialValues: { tokenId: "" }, schema: tokenSchema });
  const submit = async (values: typeof form.values) => {
    try {
      await connect({
        owner: connection.owner,
        repo: connection.repo,
        tokenId: values.tokenId,
      });
      onChanged?.();
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <GithubTokenSelect />
        <FormGeneralErrors />
        <Group justify="end">
          <FormSubmitButton>Use this token</FormSubmitButton>
        </Group>
      </Stack>
    </StandardForm>
  );
};
