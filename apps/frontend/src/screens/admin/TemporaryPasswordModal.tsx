import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { CopyField } from "../../components/CopyField";

// Unambiguous to read off a screen and type by hand.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 16;

export function temporaryPassword(): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let password = "";
  while (password.length < LENGTH) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    if (byte! < limit) {
      password += ALPHABET[byte! % ALPHABET.length];
    }
  }
  return password;
}

export const TemporaryPasswordModal = ({
  shown,
  onClose,
}: {
  shown: { username: string; password: string } | null;
  onClose: () => void;
}) => (
  <Modal
    opened={shown !== null}
    onClose={onClose}
    title="Temporary password"
    centered
    closeOnClickOutside={false}
  >
    <Stack>
      <Text size="sm">
        Give it to {shown?.username}. It is shown only this once; they choose
        their own password when they sign in.
      </Text>
      <CopyField value={shown?.password ?? ""} />
      <Group justify="end">
        <Button onClick={onClose}>Done</Button>
      </Group>
    </Stack>
  </Modal>
);
