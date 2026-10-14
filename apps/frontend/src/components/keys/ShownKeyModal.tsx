import { Button, Code, Group, Modal, Stack, Text } from "@mantine/core";
import { CodeBlock, CopyField } from "../CopyField";

export const ShownKeyModal = ({
  plaintext,
  gitUser,
  onClose,
}: {
  plaintext: string | null;
  gitUser: string;
  onClose: () => void;
}) => (
  <Modal
    opened={plaintext !== null}
    onClose={onClose}
    title="Copy your key now"
    centered
    closeOnClickOutside={false}
  >
    <Stack>
      <Text size="sm">
        It is shown only this once. Anyone with it can act as {gitUser}.
      </Text>
      <CopyField value={plaintext ?? ""} />
      <Text size="sm">
        When git asks for a password, paste the key. The username is{" "}
        <Code>{gitUser}</Code>.
      </Text>
      <CodeBlock>{`git clone ${window.location.protocol}//${gitUser}@${window.location.host}/<repository>.git`}</CodeBlock>
      <Group justify="end">
        <Button onClick={onClose}>Done</Button>
      </Group>
    </Stack>
  </Modal>
);
