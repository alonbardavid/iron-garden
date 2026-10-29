import {
  Avatar,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type AgentGrant,
  type UserSummary,
} from "@lib/contract";
import { initials } from "../../../components/AppHeader";
import { Card } from "../../../components/Card";
import { SearchSelect } from "../../../components/SearchSelect";
import { ShowMore } from "../../../components/ShowMore";
import { orpc } from "../../../logic/api/orpc";
import { nextPage, usePagedList } from "../../../logic/api/paging";
import { errorMessage } from "../../../logic/api/errors";
import { useSignedInMe } from "../../../logic/authentication/useMe";
import { useRepository } from "../RepositoryLayout";
import { SkeletonCards } from "../../../components/skeletons";

const LEVEL_OPTIONS = ACCESS_LEVELS.map((level) => ({
  value: level,
  label: level[0]!.toUpperCase() + level.slice(1),
}));

export const AccessSettingsScreen = () => (
  <Stack gap={16}>
    <MembersCard />
    <AgentsCard />
  </Stack>
);

const MembersCard = () => {
  const { name } = useRepository();
  const members = usePagedList(
    orpc.repositories.members.list.infiniteOptions({
      input: (cursor) => ({ name, cursor }),
      ...nextPage,
    }),
  );
  if (!members.items) {
    return <SkeletonCards count={1} />;
  }
  return (
    <Card title="Members">
      <AddMember />
      <Table verticalSpacing="sm">
        <Table.Tbody>
          {members.items.map((member) => (
            <MemberRow
              key={member.user.id}
              user={member.user}
              level={member.level}
            />
          ))}
        </Table.Tbody>
      </Table>
      <ShowMore list={members} />
      <Text size="sm" c="dimmed">
        Read: clone and review. Write: push and open pull requests. Admin: also
        these settings. Instance admins can always reach every repository.
      </Text>
    </Card>
  );
};

const AgentsCard = () => {
  const { name } = useRepository();
  const agents = usePagedList(
    orpc.repositories.members.agents.infiniteOptions({
      input: (cursor) => ({ name, cursor }),
      ...nextPage,
    }),
  );
  if (!agents.items) {
    return <SkeletonCards count={1} />;
  }
  return (
    <Card
      title="Agents with access"
      description="Agents reach this repository through their owner, never above the owner's level. An agent's owner changes its access from their account."
    >
      {agents.items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No agent has access.
        </Text>
      ) : (
        <AgentsTable agents={agents.items} />
      )}
      <ShowMore list={agents} />
    </Card>
  );
};

const AgentsTable = ({ agents }: { agents: AgentGrant[] }) => (
  <Table verticalSpacing="sm">
    <Table.Tbody>
      {agents.map((agent) => (
        <Table.Tr key={agent.agentId}>
          <Table.Td>
            <Group gap={8}>
              <Text fw={600} size="sm">
                {agent.agentName}
              </Text>
              <Badge size="xs" variant="light" color="gray">
                agent
              </Badge>
            </Group>
          </Table.Td>
          <Table.Td ta="right">
            <Text ff="monospace" size="sm" tt="capitalize">
              {agent.effective ?? "No access"}
            </Text>
          </Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);

function useMemberMutation() {
  const queryClient = useQueryClient();
  return async (change: () => Promise<unknown>) => {
    try {
      await change();
    } catch (err) {
      notifications.show({ color: "red", message: errorMessage(err) });
    }
    await queryClient.invalidateQueries({
      queryKey: orpc.repositories.members.key(),
    });
  };
}

// Adding someone who is already a member sets their level.
const AddMember = () => {
  const { name } = useRepository();
  const [userId, setUserId] = useState<string | null>(null);
  const [level, setLevel] = useState<AccessLevel>("read");
  const mutate = useMemberMutation();
  const add = async () => {
    if (!userId) {
      return;
    }
    await mutate(() =>
      orpc.repositories.members.set.call({ name, userId, level }),
    );
    setUserId(null);
  };
  return (
    <Group gap={8} wrap="nowrap">
      <SearchSelect
        placeholder="Add a user by name"
        search={(q) => orpc.searchUsers.queryOptions({ input: { q } })}
        toOption={(u) => ({
          value: u.id,
          label: `${u.name} (${u.username ?? u.email})`,
        })}
        value={userId}
        onChange={setUserId}
        flex={1}
        nothingFoundMessage="Nobody matches"
      />
      <Select
        data={LEVEL_OPTIONS}
        value={level}
        onChange={(v) => v && setLevel(v as AccessLevel)}
        w={120}
        allowDeselect={false}
      />
      <Button onClick={add} disabled={!userId}>
        Add
      </Button>
    </Group>
  );
};

const MemberRow = ({
  user,
  level,
}: {
  user: UserSummary;
  level: AccessLevel;
}) => {
  const me = useSignedInMe();
  const { name } = useRepository();
  const mutate = useMemberMutation();
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap={10} wrap="nowrap">
          <Avatar size={28} radius="xl" color="brand">
            {initials(user.name)}
          </Avatar>
          <div>
            <Text size="sm" fw={600}>
              {user.name}{" "}
              {user.id === me.id && (
                <Text span size="xs" c="dimmed" fw={400}>
                  you
                </Text>
              )}
            </Text>
            <Text size="xs" c="dimmed">
              {user.email}
            </Text>
          </div>
        </Group>
      </Table.Td>
      <Table.Td w={140}>
        <Select
          aria-label={`Level of ${user.name}`}
          data={LEVEL_OPTIONS}
          value={level}
          allowDeselect={false}
          onChange={(v) =>
            v &&
            mutate(() =>
              orpc.repositories.members.set.call({
                name,
                userId: user.id,
                level: v as AccessLevel,
              }),
            )
          }
        />
      </Table.Td>
      <Table.Td w={100} ta="right">
        <Button
          variant="subtle"
          color="gray"
          onClick={() =>
            mutate(() =>
              orpc.repositories.members.remove.call({ name, userId: user.id }),
            )
          }
        >
          Remove
        </Button>
      </Table.Td>
    </Table.Tr>
  );
};
