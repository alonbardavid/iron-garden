import { Center, Loader, Stack } from "@mantine/core";
import { Logo } from "../Logo";

// The whole app, before it knows who you are.
export const LoadingLayout = () => (
  <Center h="100vh" role="status" aria-label="Loading">
    <Stack align="center" gap={20}>
      <Logo size={48} />
      <Loader size="sm" type="dots" />
    </Stack>
  </Center>
);
