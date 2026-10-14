import type { ReactNode } from "react";
import {
  FormProvider,
  type FormValues,
  type UseFormReturnType,
} from "./context";

interface StandardFormProps<T extends FormValues> {
  form: UseFormReturnType<T>;
  onSubmit: (values: T) => void | Promise<void>;
  children: ReactNode;
}

export function StandardForm<T extends FormValues>({
  form,
  onSubmit,
  children,
}: StandardFormProps<T>) {
  return (
    <FormProvider form={form as unknown as UseFormReturnType<FormValues>}>
      <form onSubmit={form.onSubmit(onSubmit)}>{children}</form>
    </FormProvider>
  );
}
