import {
  Button,
  Code,
  Group,
  Popover,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { Card } from "../../components/Card";
import { CodeBlock, CopyField } from "../../components/CopyField";
import { Page } from "../../components/Page";
import { useSignedInMe } from "../../logic/authentication/useMe";
import { useRepository } from "./RepositoryLayout";
import { CodeBrowser } from "./code/CodeBrowser";
import { StartSession } from "./StartSession";

// The repository's code once it has some; until then, how to push it.
export const CodeScreen = () => {
  const repository = useRepository();
  return (
    <Page
      maw={repository.head ? undefined : 820}
      action={
        <Group gap={8}>
          {repository.head && <ClonePopover />}
          <StartSession repository={repository.name} />
        </Group>
      }
      title={
        <Group gap={10} align="baseline">
          <Title order={2} fw={400} fz={24}>
            {repository.name}
          </Title>
          {repository.description && (
            <Text size="sm" c="dimmed">
              {repository.description}
            </Text>
          )}
        </Group>
      }
    >
      {repository.head ? <CodeBrowser /> : <EmptyRepository />}
    </Page>
  );
};

const EmptyRepository = () => (
  <Stack gap={16}>
    <EmptyRepositoryCard />
    <Card title="When git asks for a password">
      <GitPasswordHint />
    </Card>
  </Stack>
);

const EmptyRepositoryCard = () => {
  const { name, cloneUrl, defaultBranch } = useRepository();
  return (
    <Card
      title="This repository is empty"
      description="Push code to it from your machine. The clone URL works with any git client over HTTPS."
    >
      <CopyField label="Clone URL" value={cloneUrl} />
      <Text size="sm" fw={600}>
        Push an existing repository
      </Text>
      <CodeBlock>{`git remote add origin ${cloneUrl}\ngit push -u origin ${defaultBranch}`}</CodeBlock>
      <Text size="sm" fw={600}>
        Or start from scratch
      </Text>
      <CodeBlock>
        {`git init -b ${defaultBranch} ${name} && cd ${name}\necho "# ${name}" > README.md\ngit add README.md && git commit -m "First commit"\ngit remote add origin ${cloneUrl}\ngit push -u origin ${defaultBranch}`}
      </CodeBlock>
    </Card>
  );
};

const ClonePopover = () => {
  const { cloneUrl } = useRepository();
  return (
    <Popover width={420} position="bottom-end" shadow="md" radius={10}>
      <Popover.Target>
        <Button variant="default" size="xs">
          Clone
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={16}>
        <Stack gap={12}>
          <CopyField label="Clone URL" value={cloneUrl} />
          <Text size="sm" fw={600}>
            When git asks for a password
          </Text>
          <GitPasswordHint />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

const GitPasswordHint = () => {
  const me = useSignedInMe();
  return (
    <>
      <Text size="sm">
        Use your username, <Code>{me.username}</Code>, and an API key as the
        password. Your account password never works for git, and neither does an
        agent&apos;s.
      </Text>
      <Group>
        <Button variant="default" size="xs" component={Link} to="/account/keys">
          Create an API key
        </Button>
      </Group>
    </>
  );
};
