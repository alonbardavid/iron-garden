import { Group, SegmentedControl, Stack } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import type {
  BranchInfo,
  GithubPullOption,
  OpenFromGithubSource,
  PullRequestDetail,
} from "@lib/contract";
import {
  FormGeneralErrors,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { FormSearchSelect } from "../../components/SearchSelect";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";
import { useRepository } from "../repository/RepositoryLayout";
import { pullRequestPath } from "./paths";

const SOURCES = [
  { label: "GitHub pull request", value: "pull" },
  { label: "Branch", value: "branch" },
];

// Opens a pull request here from a GitHub pull request or branch, for the
// server to group.
export const OpenFromGithubForms = ({ name }: { name: string }) => {
  const [source, setSource] = useState("pull");
  const open = useOpen(name);
  return (
    <Stack>
      <SegmentedControl data={SOURCES} value={source} onChange={setSource} />
      {source === "pull" ? (
        <PullForm name={name} open={open} />
      ) : (
        <BranchForm name={name} open={open} />
      )}
    </Stack>
  );
};

type Open = (source: OpenFromGithubSource) => Promise<void>;

const pullSchema = z.object({
  number: z.string().min(1, "Pick a pull request"),
});

const PullForm = ({ name, open }: { name: string; open: Open }) => {
  const form = useForm({ initialValues: { number: "" }, schema: pullSchema });
  // The select's first search, read here too for GitHub's refusal.
  const { isFetching, error } = useQuery(
    orpc.pullRequests.fromGithub.pulls.queryOptions({
      input: { name, q: "" },
    }),
  );
  const submit = submitter(form, (values: typeof form.values) =>
    open({ kind: "pull", number: Number(values.number) }),
  );
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <FormSearchSelect
          name="number"
          label="GitHub pull request"
          search={(q) =>
            orpc.pullRequests.fromGithub.pulls.queryOptions({
              input: { name, q },
            })
          }
          toOption={pullOption}
          placeholder={isFetching ? "Loading pull requests…" : "Search"}
          nothingFoundMessage="No open pull request by that name"
          description={
            error
              ? errorMessage(error)
              : "Open pull requests from this repository's branches that are not here yet. This one will stand for it."
          }
          data-autofocus
        />
        <FormGeneralErrors />
        <Group justify="end">
          <FormSubmitButton>Import</FormSubmitButton>
        </Group>
      </Stack>
    </StandardForm>
  );
};

const branchSchema = z.object({
  branch: z.string().min(1, "Pick a branch"),
  targetBranch: z.string().min(1, "Pick the branch to merge into"),
  title: z.string().trim().min(1, "Give it a title").max(300),
});

// Merges into the default branch unless told otherwise.
const BranchForm = ({ name, open }: { name: string; open: Open }) => {
  const { defaultBranch } = useRepository();
  const form = useForm({
    initialValues: { branch: "", targetBranch: defaultBranch, title: "" },
    schema: branchSchema,
  });
  const searchBranches = (q: string) =>
    orpc.repositories.branches.queryOptions({ input: { name, q } });
  const submit = submitter(form, (values: typeof form.values) =>
    open({ kind: "branch", ...values, title: values.title.trim() }),
  );
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <FormSearchSelect
          name="branch"
          label="Branch"
          search={searchBranches}
          toOption={branchOption}
          placeholder="Search branches"
          description="Branches synced from GitHub"
          data-autofocus
        />
        <FormSearchSelect
          name="targetBranch"
          label="Merge into"
          search={searchBranches}
          toOption={branchOption}
          initialOption={{ value: defaultBranch, label: defaultBranch }}
        />
        <FormTextInput name="title" label="Title" />
        <FormGeneralErrors />
        <Group justify="end">
          <FormSubmitButton>Import</FormSubmitButton>
        </Group>
      </Stack>
    </StandardForm>
  );
};

// Opens the pull request, then shows it.
function useOpen(name: string): Open {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (source) => {
    const pr: PullRequestDetail = await orpc.pullRequests.fromGithub.open.call({
      name,
      source,
    });
    await queryClient.invalidateQueries({ queryKey: orpc.pullRequests.key() });
    navigate(pullRequestPath(pr));
  };
}

// A form submit that shows a refusal as the form's error.
function submitter<Values>(
  form: { setFieldError: (field: string, error: string) => void },
  run: (values: Values) => Promise<void>,
) {
  return async (values: Values) => {
    try {
      await run(values);
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
    }
  };
}

function branchOption(branch: BranchInfo) {
  return { value: branch.name, label: branch.name };
}

function pullOption(pull: GithubPullOption) {
  return {
    value: String(pull.number),
    label: `#${pull.number} ${pull.title} (${pull.branch} → ${pull.targetBranch})`,
  };
}
