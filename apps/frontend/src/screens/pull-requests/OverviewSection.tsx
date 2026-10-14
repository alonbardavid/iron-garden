import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useId, type ReactNode } from "react";
import { palette } from "@lib/ds";

// A card on the overview: a titled section, with an optional line beside
// the title and meta at its end.
export const Section = ({
  title,
  meta,
  headline,
  children,
}: {
  title: string;
  meta?: ReactNode;
  headline?: ReactNode;
  children: ReactNode;
}) => {
  const id = useId();
  return (
    <Paper
      component="section"
      aria-labelledby={id}
      withBorder
      py={16}
      px={18}
      style={{ borderColor: palette.card }}
    >
      <Stack gap={10}>
        <Group gap={10} align="baseline">
          <Title id={id} order={2} fz={15} fw={600}>
            {title}
          </Title>
          {headline}
          {meta && (
            <Text fz={12} c={palette.meta} ml="auto">
              {meta}
            </Text>
          )}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
};
