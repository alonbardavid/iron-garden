import { ThemeIcon } from "@mantine/core";
import { CheckIcon } from "./icons";

// A green tick beside a setup step that is complete.
export const DoneMark = ({ label }: { label: string }) => (
  <ThemeIcon
    color="green"
    radius="xl"
    size={18}
    role="img"
    aria-label={label}
    title={label}
  >
    <CheckIcon size={11} />
  </ThemeIcon>
);
