import { Group, Select } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@lib/ds";
import { BranchIcon } from "../../../components/icons";
import { orpc } from "../../../logic/api/orpc";
import { useRepository } from "../RepositoryLayout";

// Which branch to look at. A commit being looked at shows as itself until a
// branch is picked. onChange gets undefined for the default branch.
export const RefPicker = ({
  value,
  onChange,
}: {
  value?: string;
  onChange: (ref: string | undefined) => void;
}) => {
  const { name, defaultBranch } = useRepository();
  const { data: branches } = useQuery(
    orpc.repositories.branches.queryOptions({ input: { name } }),
  );
  const current = value ?? defaultBranch;
  const names = branches?.map((branch) => branch.name) ?? [defaultBranch];
  const options = names.includes(current)
    ? names
    : [...names, { value: current, label: current.slice(0, 12) }];
  return (
    <Group gap={6} wrap="nowrap" c={palette.secondary}>
      <BranchIcon />
      <Select
        aria-label="Branch"
        size="xs"
        w={220}
        searchable
        allowDeselect={false}
        nothingFoundMessage="No such branch"
        data={options}
        value={current}
        onChange={(picked) =>
          picked && onChange(picked === defaultBranch ? undefined : picked)
        }
        styles={{
          input: { fontFamily: "var(--mantine-font-family-monospace)" },
        }}
      />
    </Group>
  );
};
