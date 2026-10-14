import { Box, Group, Title } from "@mantine/core";
import type { ReactNode } from "react";

// The gray page body under the header, with a title row.
export const Page = ({
  title,
  action,
  maw = 1344,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  maw?: number;
  children: ReactNode;
}) => (
  <Box px={48} py={24} maw={maw + 96}>
    {(title || action) && (
      <Group justify="space-between" mb={16} mih={36}>
        {typeof title === "string" ? (
          <Title order={2} fw={400} fz={24}>
            {title}
          </Title>
        ) : (
          title
        )}
        {action}
      </Group>
    )}
    {children}
  </Box>
);
