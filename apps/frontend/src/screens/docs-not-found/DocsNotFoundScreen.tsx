import { Anchor, Group, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { DOCS_PATH } from "@lib/contract/constants";
import { AuthCard } from "../../components/layouts/UnauthenticatedLayout";

// The Worker answers a path it has no file for with the SPA, so a docs page
// that does not exist lands here rather than on the app's home.
export const DocsNotFoundScreen = () => (
  <AuthCard>
    <Stack gap="xs">
      <Title order={2} fz={20}>
        Page not found
      </Title>
      <Text size="sm">The documentation has no page at this address.</Text>
      <Group gap="md">
        <Anchor href={DOCS_PATH} size="sm">
          Go to the documentation
        </Anchor>
        <Anchor component={Link} to="/" size="sm">
          Back to the app
        </Anchor>
      </Group>
    </Stack>
  </AuthCard>
);
