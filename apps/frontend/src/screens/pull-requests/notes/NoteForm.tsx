import { Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { z } from "zod";
import {
  FormGeneralErrors,
  FormTextarea,
  GENERAL_ERROR_KEY,
  palette,
  StandardForm,
  useForm,
} from "@lib/ds";
import { errorMessage } from "../../../logic/api/errors";
import { Action } from "./parts";

const schema = z.object({ body: z.string().trim().min(1, "Write something") });

// A comment or reply being written: the text, a hint on where it goes, and
// the buttons that send it, which submit the form.
export const NoteForm = ({
  label,
  placeholder,
  hint,
  submit,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  hint?: ReactNode;
  submit: ReactNode;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel: () => void;
}) => {
  const form = useForm({ initialValues: { body: "" }, schema });
  const send = async ({ body }: typeof form.values) => {
    try {
      await onSubmit(body.trim());
      form.reset();
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
  return (
    <StandardForm form={form} onSubmit={send}>
      <Stack gap={8}>
        <FormTextarea
          name="body"
          aria-label={label}
          placeholder={placeholder}
          autosize
          minRows={3}
          maxRows={14}
          data-autofocus
          autoFocus
        />
        <FormGeneralErrors />
        <Group gap={10} wrap="nowrap">
          <Text fz={12} c={palette.muted} style={{ flex: 1 }}>
            {hint}
          </Text>
          <Action onClick={onCancel} color={palette.secondary}>
            Cancel
          </Action>
          {submit}
        </Group>
      </Stack>
    </StandardForm>
  );
};
