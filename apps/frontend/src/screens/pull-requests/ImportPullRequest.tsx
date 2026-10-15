import { Button, Modal, Stack, Tabs } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BranchIcon } from "../../components/icons";
import { orpc } from "../../logic/api/orpc";
import { AgentPrompt } from "../repository/StartSession";
import { importPrompt } from "../repository/sessionPrompt";
import { OpenFromGithubForms } from "./OpenFromGithub";

// Brings a pull request made elsewhere into review here. An agent pushes its
// branch through a session; a repository connected to GitHub, whose pull
// requests the server groups, can also open one straight from GitHub.
export const ImportPullRequestButton = ({ name }: { name: string }) => {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button
        variant="default"
        leftSection={<BranchIcon />}
        onClick={() => setOpened(true)}
      >
        Import
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Import a pull request"
        centered
        size="lg"
      >
        <ImportSources name={name} />
      </Modal>
    </>
  );
};

const ImportSources = ({ name }: { name: string }) => {
  const { data } = useQuery(
    orpc.pullRequests.fromGithub.available.queryOptions({ input: { name } }),
  );
  return data?.available ? (
    <Tabs defaultValue="github">
      <Tabs.List>
        <Tabs.Tab value="github">From GitHub</Tabs.Tab>
        <Tabs.Tab value="agent">By agent</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="github" pt={16}>
        <OpenFromGithubForms name={name} />
      </Tabs.Panel>
      <Tabs.Panel value="agent" pt={16}>
        <ByAgent name={name} />
      </Tabs.Panel>
    </Tabs>
  ) : (
    <ByAgent name={name} />
  );
};

const ByAgent = ({ name }: { name: string }) => (
  <Stack gap={12}>
    <AgentPrompt prompt={importPrompt(window.location.origin, name)} />
  </Stack>
);
