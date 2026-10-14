import {
  Anchor,
  Button,
  Code,
  CopyButton,
  Group,
  Popover,
  Stack,
  Text,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { palette } from "@lib/ds";
import { API_KEY_VARIABLE, sessionPrompt } from "./sessionPrompt";

// A small button that shows what to tell an agent so it starts a session on
// this repository, and the API call behind it.
export const StartSession = ({ repository }: { repository: string }) => {
  const prompt = sessionPrompt(window.location.origin, repository);
  return (
    <Popover width={560} position="bottom-end" shadow="md" radius={10}>
      <Popover.Target>
        <Button variant="default" size="xs">
          Start session
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={16}>
        <Stack gap={12}>
          <Text fz={15} fw={600}>
            Start an agent session
          </Text>
          <Text fz={13} c={palette.body}>
            Give your agent this prompt. It reads its agent API key from the{" "}
            <Code>{API_KEY_VARIABLE}</Code> environment variable, so the key
            never appears in the prompt.
          </Text>
          <Text
            component="pre"
            m={0}
            p={12}
            ff="monospace"
            fz={12}
            lh={1.5}
            mah={320}
            bg={palette.panel}
            style={{
              whiteSpace: "pre-wrap",
              overflowY: "auto",
              border: `1px solid ${palette.control}`,
              borderRadius: 6,
            }}
          >
            {prompt}
          </Text>
          <Group justify="space-between">
            <Anchor component={Link} to="/account/agents" fz={13}>
              Create an agent and its key
            </Anchor>
            <CopyButton value={prompt}>
              {({ copied, copy }) => (
                <Button size="xs" onClick={copy}>
                  {copied ? "Copied" : "Copy prompt"}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Stack
            gap={4}
            pt={10}
            style={{ borderTop: `1px solid ${palette.line}` }}
          >
            <Text fz={12} fw={600} c={palette.secondary}>
              The API
            </Text>
            <Text fz={12} c={palette.secondary}>
              <Code>POST /api/sessions</Code> with the key as{" "}
              <Code>Authorization: Bearer</Code> or <Code>x-api-key</Code>, and
              JSON <Code>repository</Code> (required), <Code>client</Code> (what
              the agent is, which the session prompt can tailor itself to),{" "}
              <Code>title</Code>, <Code>goal</Code> and <Code>context</Code>.
              Only agent keys can start sessions; the agent needs Write on this
              repository.
            </Text>
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
