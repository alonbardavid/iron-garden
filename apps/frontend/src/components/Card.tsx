import { Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export const Card = ({
  title,
  description,
  children,
  p = 18,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  p?: number;
}) => (
  <Paper withBorder radius="md" p={p}>
    <Stack gap={12}>
      {title && (
        <Title order={3} fz={16} fw={600}>
          {title}
        </Title>
      )}
      {description && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
      {children}
    </Stack>
  </Paper>
);
