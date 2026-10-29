import {
  MultiSelect,
  Select,
  type ComboboxItem,
  type MultiSelectProps,
  type SelectProps,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  keepPreviousData,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useState } from "react";
import { useFormContext } from "@lib/ds";

// How long typing pauses before the server is searched.
const SEARCH_DELAY_MS = 250;

export interface SearchSource<Item> {
  // The server's few matches for what is typed so far; "" asks for the first.
  search: (q: string) => UseQueryOptions<Item[], Error, Item[], QueryKey>;
  toOption: (item: Item) => ComboboxItem;
}

type Searched = "data" | "filter" | "searchable" | "searchValue";

type SearchSelectProps<Item> = SearchSource<Item> &
  Omit<SelectProps, Searched | "onSearchChange"> & {
    // The current value's option, for a value no search has turned up yet.
    initialOption?: ComboboxItem | null;
  };

// A select whose options the server searches as you type: it only ever
// shows the few it answers, so it works however many there are.
export function SearchSelect<Item>({
  search,
  toOption,
  initialOption = null,
  onChange,
  ...props
}: SearchSelectProps<Item>) {
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<ComboboxItem | null>(null);
  const value = props.value ?? null;
  const current =
    [picked, initialOption].find((option) => option?.value === value) ?? null;
  // The picked option's label fills the field; opening it again should show
  // the first options, not only that one.
  const options = useSearchOptions(
    { search, toOption },
    typed === current?.label ? "" : typed,
    !props.disabled,
  );
  return (
    <Select
      {...props}
      searchable
      data={withOptions(options, current ? [current] : [])}
      filter={({ options: all }) => all}
      searchValue={typed}
      onSearchChange={setTyped}
      onChange={(next, option) => {
        setPicked(option);
        onChange?.(next, option);
      }}
    />
  );
}

// A SearchSelect for a form field.
export function FormSearchSelect<Item>({
  name,
  ...props
}: { name: string } & Omit<SearchSelectProps<Item>, "error">) {
  const form = useFormContext();
  return <SearchSelect {...props} {...form.getInputProps(name)} />;
}

type SearchMultiSelectProps<Item> = SearchSource<Item> &
  Omit<MultiSelectProps, Searched | "onSearchChange" | "value" | "onChange"> & {
    value: string[];
    onChange: (value: string[]) => void;
    // The options of values chosen before, which no search has turned up.
    initialOptions?: ComboboxItem[];
  };

// Several values picked from what the server searches as you type.
export function SearchMultiSelect<Item>({
  search,
  toOption,
  initialOptions = [],
  value,
  onChange,
  ...props
}: SearchMultiSelectProps<Item>) {
  const [typed, setTyped] = useState("");
  const [known, setKnown] = useState(
    () => new Map(initialOptions.map((option) => [option.value, option])),
  );
  const options = useSearchOptions({ search, toOption }, typed, true);
  const chosen = value.map(
    (v) =>
      known.get(v) ??
      options.find((option) => option.value === v) ?? { value: v, label: v },
  );
  return (
    <MultiSelect
      {...props}
      searchable
      data={withOptions(options, chosen)}
      filter={({ options: all }) => all}
      searchValue={typed}
      onSearchChange={setTyped}
      value={value}
      onChange={(next) => {
        setKnown(
          (before) =>
            new Map([
              ...before,
              ...options.map((option) => [option.value, option] as const),
            ]),
        );
        onChange(next);
      }}
    />
  );
}

function useSearchOptions<Item>(
  { search, toOption }: SearchSource<Item>,
  typed: string,
  enabled: boolean,
): ComboboxItem[] {
  const [q] = useDebouncedValue(typed.trim(), SEARCH_DELAY_MS);
  const { data = [] } = useQuery({
    ...search(q),
    enabled,
    placeholderData: keepPreviousData,
  });
  return data.map(toOption);
}

// The searched options and any of `kept` they leave out, each once.
function withOptions(
  searched: ComboboxItem[],
  kept: ComboboxItem[],
): ComboboxItem[] {
  const seen = new Set(searched.map((option) => option.value));
  return [...searched, ...kept.filter((option) => !seen.has(option.value))];
}
