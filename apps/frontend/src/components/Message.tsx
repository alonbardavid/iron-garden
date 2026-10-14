import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { palette } from "@lib/ds";

// A line in place of a file's lines: why they are not shown, or a loader.
export const Message = ({
  color = palette.secondary,
  children,
}: {
  color?: string;
  children: ReactNode;
}) => (
  <Stack align="center" gap={8} py={32} px={16} fz={12.5} c={color}>
    {children}
  </Stack>
);
