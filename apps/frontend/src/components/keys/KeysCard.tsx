import { Button, Group, Table, Text } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { ApiKey } from "@lib/contract";
import { formatDate, timeAgo } from "../../logic/time";
import { Card } from "../Card";
import { NewKeyModal, type NewKeyInput } from "./NewKeyModal";
import { ShownKeyModal } from "./ShownKeyModal";

// A principal's keys with the create-once and revoke flows, for personal and
// agent keys alike.
export const KeysCard = ({
  keys,
  gitUser,
  description,
  onCreate,
  onRevoke,
}: {
  keys: ApiKey[];
  gitUser: string;
  description: ReactNode;
  onCreate: (input: NewKeyInput) => Promise<string>;
  onRevoke: (id: string) => Promise<unknown>;
}) => {
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  return (
    <Card
      title={
        <Group justify="space-between">
          API keys
          <Button onClick={() => setCreating(true)}>New key</Button>
        </Group>
      }
      description={description}
    >
      <KeysTable keys={keys} onRevoke={onRevoke} />
      <NewKeyModal
        opened={creating}
        onClose={() => setCreating(false)}
        onCreate={async (input) => {
          const plaintext = await onCreate(input);
          setCreating(false);
          setShown(plaintext);
        }}
      />
      <ShownKeyModal
        plaintext={shown}
        gitUser={gitUser}
        onClose={() => setShown(null)}
      />
    </Card>
  );
};

const KeysTable = ({
  keys,
  onRevoke,
}: {
  keys: ApiKey[];
  onRevoke: (id: string) => Promise<unknown>;
}) => {
  if (keys.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No keys. Create one to use git or the API from a machine.
      </Text>
    );
  }
  return (
    <Table verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Created</Table.Th>
          <Table.Th>Last used</Table.Th>
          <Table.Th>Expires</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {keys.map((key) => (
          <Table.Tr key={key.id}>
            <Table.Td>
              <Text span fw={600} size="sm">
                {key.name}
              </Text>{" "}
              <Text span ff="monospace" size="xs" c="dimmed">
                {key.start}…
              </Text>
            </Table.Td>
            <Table.Td>{formatDate(key.createdAt)}</Table.Td>
            <Table.Td>
              {key.lastUsedAt ? timeAgo(key.lastUsedAt) : "Never"}
            </Table.Td>
            <Table.Td>
              {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
            </Table.Td>
            <Table.Td ta="right">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => onRevoke(key.id)}
              >
                Revoke
              </Button>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};
