import { Paper, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Wordmark } from "../Logo";

export const UnauthenticatedLayout = () => (
  <main>
    <Outlet />
  </main>
);

// The centered card of the signed-out and first-run screens.
export const AuthCard = ({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <Stack align="center" pt={64} px={16} gap={24}>
    <Wordmark large />
    <Paper withBorder radius="md" p={24} w="100%" maw={420}>
      {children}
    </Paper>
    {footer && (
      <Text size="sm" c="dimmed" maw={420}>
        {footer}
      </Text>
    )}
  </Stack>
);
