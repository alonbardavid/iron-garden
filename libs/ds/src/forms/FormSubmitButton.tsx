import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@mantine/core";
import { useFormContext } from "./context";

export function FormSubmitButton({
  children,
  ...props
}: ButtonProps & { children: ReactNode }) {
  const form = useFormContext();
  const disabled = !form.isTouched() || !form.isValid();
  return (
    <Button
      type="submit"
      loading={form.submitting}
      disabled={disabled}
      {...props}
    >
      {children}
    </Button>
  );
}
