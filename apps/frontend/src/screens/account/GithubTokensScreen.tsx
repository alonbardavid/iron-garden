import { Badge, Button, Group, Modal, Stack, Table, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import type { GithubToken } from "@lib/contract";
import {
  FormGeneralErrors,
  FormPasswordInput,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { Card } from "../../components/Card";
import { orpc } from "../../logic/api/orpc";
import { errorMessage } from "../../logic/api/errors";
import { formatDate, timeAgo } from "../../logic/time";
import { SkeletonRows } from "../../components/skeletons";

export const GithubTokensScreen = () => {
  const [adding, setAdding] = useState(false);
  const { data: tokens } = useQuery(orpc.githubTokens.list.queryOptions());
  return (
    <Card
      title={
        <Group justify="space-between">
          GitHub tokens
          <Button onClick={() => setAdding(true)}>Add token</Button>
        </Group>
      }
      description="Personal access tokens from your GitHub account. Repositories you connect to GitHub read their branches, workflow runs and artifacts with one of them; they are stored encrypted and never shown again."
    >
      {tokens ? <TokensTable tokens={tokens} /> : <SkeletonRows rows={2} />}
      <AddTokenModal opened={adding} onClose={() => setAdding(false)} />
    </Card>
  );
};

const TokensTable = ({ tokens }: { tokens: GithubToken[] }) => {
  if (tokens.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No GitHub tokens. Add one to import a repository or connect one to
        GitHub.
      </Text>
    );
  }
  return (
    <Table verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>GitHub account</Table.Th>
          <Table.Th>Expires</Table.Th>
          <Table.Th>Last used</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {tokens.map((token) => (
          <TokenRow key={token.id} token={token} />
        ))}
      </Table.Tbody>
    </Table>
  );
};

const TokenRow = ({ token }: { token: GithubToken }) => {
  const remove = useDeleteGithubToken();
  return (
    <Table.Tr>
      <Table.Td>
        <Text span fw={600} size="sm">
          {token.name}
        </Text>{" "}
        <Text span ff="monospace" size="xs" c="dimmed">
          …{token.hint}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={6}>
          <Text size="sm">{token.githubLogin}</Text>
          <Badge variant="light" color="gray" size="sm">
            {token.scopes === null ? "Fine-grained" : "Classic"}
          </Badge>
        </Group>
      </Table.Td>
      <Table.Td>
        {token.expiresAt ? formatDate(token.expiresAt) : "Never"}
      </Table.Td>
      <Table.Td>
        {token.lastUsedAt ? timeAgo(token.lastUsedAt) : "Never"}
      </Table.Td>
      <Table.Td ta="right">
        <Button variant="subtle" color="gray" onClick={() => remove(token.id)}>
          Delete
        </Button>
      </Table.Td>
    </Table.Tr>
  );
};

const schema = z.object({
  name: z.string().trim().min(1, "Name the token"),
  token: z.string().trim().min(20, "Paste the whole token"),
});

const AddTokenModal = ({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) => {
  const add = useAddGithubToken();
  const form = useForm({ initialValues: { name: "", token: "" }, schema });
  const submit = async (values: typeof form.values) => {
    try {
      await add({ name: values.name.trim(), token: values.token.trim() });
      form.reset();
      onClose();
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add a GitHub token"
      size="lg"
      centered
    >
      <StandardForm form={form} onSubmit={submit}>
        <Stack>
          <TokenPermissions />
          <FormTextInput
            name="name"
            label="Name"
            description="A label of your own, to tell your tokens apart."
            placeholder="Work repositories"
            data-autofocus
          />
          <FormPasswordInput name="token" label="Token" />
          <FormGeneralErrors />
          <Group justify="end">
            <FormSubmitButton>Add token</FormSubmitButton>
          </Group>
        </Stack>
      </StandardForm>
    </Modal>
  );
};

// What each feature needs from GitHub, so a token can be made as narrow as
// the way it will be used.
const FINE_GRAINED: { permission: string; access: string; use: string }[] = [
  {
    permission: "Actions",
    access: "Read and write",
    use: "Workflow runs, jobs, logs and artifacts (read). Start workflows from rules (write).",
  },
  {
    permission: "Commit statuses",
    access: "Read",
    use: "Statuses from other CI on the pull request overview.",
  },
  {
    permission: "Contents",
    access: "Read and write",
    use: "Mirror branches (read). Push a pull request's branch when you create it in GitHub, and merge (write).",
  },
  {
    permission: "Pull requests",
    access: "Read and write",
    use: "Link GitHub pull requests (read). Create and merge them (write).",
  },
  {
    permission: "Webhooks",
    access: "Read and write",
    use: "Optional: create and remove the webhook for you instead of adding it by hand.",
  },
  {
    permission: "Workflows",
    access: "Read and write",
    use: "Optional: push pull request branches that change .github/workflows.",
  },
];

const CLASSIC: { scope: string; use: string }[] = [
  {
    scope: "admin:repo_hook",
    use: "Optional: create and remove the webhook for you (repo already includes it).",
  },
  {
    scope: "repo",
    use: "Everything above for private repositories (public_repo is enough for public ones).",
  },
  {
    scope: "workflow",
    use: "Optional: push pull request branches that change .github/workflows.",
  },
];

const TokenPermissions = () => (
  <Stack gap={10}>
    <Text size="sm">
      Create one under GitHub › Settings › Developer settings › Personal access
      tokens. A token can do in a repository only what its owner can, so use one
      of an account with write access there.
    </Text>
    <FineGrainedPermissions />
    <ClassicScopes />
    <Text size="xs" c="dimmed">
      To only import, mirror and see CI, the read levels are enough. GitHub does
      not let a fine-grained token read check runs, so pull requests show its
      Actions workflow runs and commit statuses instead; a classic token sees
      every check, including other CI apps.
    </Text>
  </Stack>
);

const FineGrainedPermissions = () => (
  <Stack gap={4}>
    <Text size="sm" fw={600}>
      Fine-grained token
    </Text>
    <Text size="xs" c="dimmed">
      Give it access to the repositories it will mirror (an organization may
      have to approve it), with these repository permissions. GitHub adds
      Metadata: read by itself.
    </Text>
    <Table fz="xs" verticalSpacing={4} withTableBorder>
      <Table.Tbody>
        {FINE_GRAINED.map((row) => (
          <Table.Tr key={row.permission}>
            <Table.Td fw={600} style={{ whiteSpace: "nowrap" }}>
              {row.permission}
            </Table.Td>
            <Table.Td style={{ whiteSpace: "nowrap" }}>{row.access}</Table.Td>
            <Table.Td>{row.use}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  </Stack>
);

const ClassicScopes = () => (
  <Stack gap={4}>
    <Text size="sm" fw={600}>
      Classic token
    </Text>
    <Table fz="xs" verticalSpacing={4} withTableBorder>
      <Table.Tbody>
        {CLASSIC.map((row) => (
          <Table.Tr key={row.scope}>
            <Table.Td style={{ whiteSpace: "nowrap" }}>
              <code>{row.scope}</code>
            </Table.Td>
            <Table.Td>{row.use}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  </Stack>
);

function useAddGithubToken() {
  const queryClient = useQueryClient();
  return async (input: { name: string; token: string }) => {
    await orpc.githubTokens.create.call(input);
    await queryClient.invalidateQueries({ queryKey: orpc.githubTokens.key() });
  };
}

function useDeleteGithubToken() {
  const queryClient = useQueryClient();
  return async (id: string) => {
    await orpc.githubTokens.delete.call({ id });
    await queryClient.invalidateQueries({ queryKey: orpc.githubTokens.key() });
  };
}
