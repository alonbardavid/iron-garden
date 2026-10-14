import {
  Badge,
  Button,
  Code,
  Group,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type AgentDetail,
} from "@lib/contract";
import { Card } from "../../components/Card";
import { CodeBlock } from "../../components/CopyField";
import { KeysCard } from "../../components/keys/KeysCard";
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { SkeletonCards } from "../../components/skeletons";

export const AgentScreen = () => {
  const { name = "" } = useParams();
  const { data: agent, error } = useQuery(
    orpc.agents.get.queryOptions({ input: { name } }),
  );
  if (error) {
    throw error;
  }
  if (!agent) {
    return <SkeletonCards count={3} />;
  }
  return (
    <Stack gap={16}>
      <AgentCard agent={agent} />
      <AccessCard agent={agent} />
      <AgentKeys agent={agent} />
      <ConnectCard agent={agent} />
    </Stack>
  );
};

function useRefreshAgent() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: orpc.agents.key() });
}

async function attempt(change: () => Promise<unknown>) {
  try {
    await change();
  } catch (err) {
    notifications.show({ color: "red", message: errorMessage(err) });
  }
}

const AgentCard = ({ agent }: { agent: AgentDetail }) => {
  const refresh = useRefreshAgent();
  const navigate = useNavigate();
  const toggle = () =>
    attempt(async () => {
      await orpc.agents.update.call({
        name: agent.name,
        active: !agent.active,
      });
      await refresh();
    });
  const remove = () =>
    attempt(async () => {
      await orpc.agents.delete.call({ name: agent.name });
      await refresh();
      navigate("/account/agents");
    });
  return (
    <Card
      title={
        <Group justify="space-between">
          <Group gap={8}>
            {agent.name}
            <Badge size="sm" variant="light" color="gray">
              agent
            </Badge>
          </Group>
          <Group gap={8}>
            <Text size="sm" c={agent.active ? "green" : "dimmed"}>
              {agent.active ? "Active" : "Deactivated"}
            </Text>
            <Button
              variant="outline"
              color={agent.active ? "red" : "brand"}
              onClick={toggle}
            >
              {agent.active ? "Deactivate" : "Reactivate"}
            </Button>
            <Button variant="subtle" color="red" onClick={remove}>
              Delete
            </Button>
          </Group>
        </Group>
      }
      description={
        agent.description ??
        "Deactivating stops its keys at once; deleting also revokes them for good."
      }
    />
  );
};

const NO_ACCESS = "none";
const LEVEL_OPTIONS = [
  { value: NO_ACCESS, label: "No access" },
  ...ACCESS_LEVELS.map((level) => ({
    value: level,
    label: level[0]!.toUpperCase() + level.slice(1),
  })),
];

const AccessCard = ({ agent }: { agent: AgentDetail }) => {
  const refresh = useRefreshAgent();
  const { data: repositories } = useQuery(
    orpc.repositories.list.queryOptions(),
  );
  const granted = new Map(agent.access.map((a) => [a.repository, a.level]));
  const set = (repository: string, value: string) =>
    attempt(async () => {
      await orpc.agents.setAccess.call({
        agent: agent.name,
        repository,
        level: value === NO_ACCESS ? null : (value as AccessLevel),
      });
      await refresh();
    });
  return (
    <Card
      title="Repository access"
      description="Only repositories you can reach, and never above your own level there."
    >
      <Table verticalSpacing="xs">
        <Table.Tbody>
          {(repositories ?? []).map((repo) => (
            <Table.Tr key={repo.id}>
              <Table.Td>
                <Text size="sm" fw={600}>
                  {repo.name}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  You: {repo.level}
                </Text>
              </Table.Td>
              <Table.Td w={160}>
                <Select
                  aria-label={`Access to ${repo.name}`}
                  data={LEVEL_OPTIONS.filter(
                    (o) =>
                      o.value === NO_ACCESS ||
                      rank(o.value) <= rank(repo.level),
                  )}
                  value={granted.get(repo.name) ?? NO_ACCESS}
                  allowDeselect={false}
                  onChange={(v) => v && set(repo.name, v)}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
};

const rank = (level: string) => ACCESS_LEVELS.indexOf(level as AccessLevel);

const AgentKeys = ({ agent }: { agent: AgentDetail }) => {
  const refresh = useRefreshAgent();
  return (
    <KeysCard
      keys={agent.keys}
      gitUser={agent.name}
      description={
        <>
          The agent sends a key as <Code>x-api-key</Code> to start sessions and
          open pull requests.
        </>
      }
      onCreate={async (input) => {
        const created = await orpc.agents.keys.create.call({
          agent: agent.name,
          ...input,
        });
        await refresh();
        return created.plaintext;
      }}
      onRevoke={async (id) => {
        await orpc.agents.keys.revoke.call({ agent: agent.name, id });
        await refresh();
      }}
    />
  );
};

const ConnectCard = ({ agent }: { agent: AgentDetail }) => (
  <Card
    title="Start a session"
    description="The agent starts each task with a session. The response holds a git remote and token for the session's own repository, and step-by-step instructions."
  >
    <CodeBlock>
      {`curl -X POST ${window.location.origin}/api/sessions \\
  -H "x-api-key: $${agent.name.toUpperCase().replace(/-/g, "_")}_KEY" \\
  -H "content-type: application/json" \\
  -d '{"repository": "<repository>", "title": "<task>", "goal": "<what and why>"}'`}
    </CodeBlock>
  </Card>
);
