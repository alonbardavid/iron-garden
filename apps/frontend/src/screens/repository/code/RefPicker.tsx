import { Group } from "@mantine/core";
import type { BranchInfo } from "@lib/contract";
import { palette } from "@lib/ds";
import { BranchIcon } from "../../../components/icons";
import { SearchSelect } from "../../../components/SearchSelect";
import { orpc } from "../../../logic/api/orpc";
import { useRepository } from "../RepositoryLayout";
import { isCommitHash } from "./paths";

// Which branch to look at, searched by name. A commit being looked at shows
// as itself until a branch is picked. onChange gets undefined for the
// default branch.
export const RefPicker = ({
  value,
  onChange,
}: {
  value?: string;
  onChange: (ref: string | undefined) => void;
}) => {
  const { name, defaultBranch } = useRepository();
  const current = value ?? defaultBranch;
  return (
    <Group gap={6} wrap="nowrap" c={palette.secondary}>
      <BranchIcon />
      <SearchSelect
        aria-label="Branch"
        size="xs"
        w={220}
        allowDeselect={false}
        nothingFoundMessage="No such branch"
        search={(q) =>
          orpc.repositories.branches.queryOptions({ input: { name, q } })
        }
        toOption={(branch: BranchInfo) => refOption(branch.name)}
        initialOption={refOption(current)}
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

function refOption(ref: string) {
  return {
    value: ref,
    label: isCommitHash(ref) ? ref.slice(0, 12) : ref,
  };
}
