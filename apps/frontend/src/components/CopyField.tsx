import { Button, CopyButton, Group, TextInput } from "@mantine/core";
import { palette } from "@lib/ds";

export const CopyField = ({
  value,
  label,
}: {
  value: string;
  label?: string;
}) => (
  <Group gap={8} wrap="nowrap" align="end">
    <TextInput
      label={label}
      value={value}
      readOnly
      flex={1}
      styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
      onFocus={(e) => e.currentTarget.select()}
    />
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Button variant="default" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
    </CopyButton>
  </Group>
);

export const CodeBlock = ({ children }: { children: string }) => (
  <pre style={codeStyle}>{children}</pre>
);

const codeStyle = {
  margin: 0,
  padding: "12px 12px",
  background: palette.panel,
  border: `1px solid ${palette.control}`,
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1.5,
  overflowX: "auto" as const,
};
