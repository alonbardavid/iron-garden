import type { ReactNode } from "react";
import {
  Autocomplete,
  type AutocompleteProps,
  NumberInput,
  type NumberInputProps,
  PasswordInput,
  type PasswordInputProps,
  Radio,
  type RadioGroupProps,
  Stack,
  Select,
  type SelectProps,
  Textarea,
  type TextareaProps,
  TextInput,
  type TextInputProps,
} from "@mantine/core";
import { useFormContext } from "./context";

interface FormFieldProps {
  name: string;
}

export function FormTextInput({
  name,
  ...props
}: FormFieldProps & Omit<TextInputProps, "error">) {
  const form = useFormContext();
  return <TextInput {...props} {...form.getInputProps(name)} />;
}

export function FormPasswordInput({
  name,
  ...props
}: FormFieldProps & Omit<PasswordInputProps, "error">) {
  const form = useFormContext();
  return <PasswordInput {...props} {...form.getInputProps(name)} />;
}

// A text field that suggests values as you type; any text is allowed.
export function FormAutocomplete({
  name,
  ...props
}: FormFieldProps & Omit<AutocompleteProps, "error">) {
  const form = useFormContext();
  return <Autocomplete {...props} {...form.getInputProps(name)} />;
}

export interface FormRadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

// One choice of a few, each with its own explanation.
export function FormRadioGroup({
  name,
  options,
  ...props
}: FormFieldProps &
  Omit<RadioGroupProps, "error" | "children"> & {
    options: FormRadioOption[];
  }) {
  const form = useFormContext();
  return (
    <Radio.Group {...props} {...form.getInputProps(name)}>
      <Stack gap={10} mt={8}>
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
            disabled={option.disabled}
          />
        ))}
      </Stack>
    </Radio.Group>
  );
}

export function FormNumberInput({
  name,
  ...props
}: FormFieldProps & Omit<NumberInputProps, "error">) {
  const form = useFormContext();
  return <NumberInput {...props} {...form.getInputProps(name)} />;
}

export function FormSelect({
  name,
  ...props
}: FormFieldProps & Omit<SelectProps, "error">) {
  const form = useFormContext();
  return <Select {...props} {...form.getInputProps(name)} />;
}

export function FormTextarea({
  name,
  ...props
}: FormFieldProps & Omit<TextareaProps, "error">) {
  const form = useFormContext();
  return <Textarea {...props} {...form.getInputProps(name)} />;
}
