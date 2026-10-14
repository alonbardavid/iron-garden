import { createContext, useContext, type ReactNode } from "react";
import {
  useForm as useMantineForm,
  type UseFormInput,
  type UseFormReturnType,
} from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import type { ZodType } from "zod";

export type FormValues = Record<string, unknown>;

type TransformValuesFn<Values> = (values: Values) => unknown;

export type UseFormProps<
  Values,
  TransformValues extends TransformValuesFn<Values> = (
    values: Values,
  ) => Values,
> = UseFormInput<Values, TransformValues> & {
  schema?: ZodType;
};

export function useForm<
  Values extends Record<string, unknown> = Record<string, unknown>,
  TransformValues extends TransformValuesFn<Values> = (
    values: Values,
  ) => Values,
>({
  schema,
  validate,
  ...input
}: UseFormProps<Values, TransformValues> = {}): UseFormReturnType<
  Values,
  TransformValues
> {
  return useMantineForm<Values, TransformValues>({
    ...input,
    validate: schema ? zod4Resolver(schema) : validate,
  });
}

export const GENERAL_ERROR_KEY = "_general";

const FormContext = createContext<UseFormReturnType<FormValues> | null>(null);

export function FormProvider({
  form,
  children,
}: {
  form: UseFormReturnType<FormValues>;
  children: ReactNode;
}) {
  return <FormContext.Provider value={form}>{children}</FormContext.Provider>;
}

export function useFormContext(): UseFormReturnType<FormValues> {
  const form = useContext(FormContext);
  if (!form) {
    throw new Error("useFormContext must be used within a StandardForm");
  }
  return form;
}

export { type UseFormReturnType };
