import {
  Button,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Stack,
} from "@mantine/core";
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
  FormSelect,
  FormSubmitButton,
  FormTextInput,
  GENERAL_ERROR_KEY,
  StandardForm,
  useForm,
} from "@lib/ds";
import { BranchIcon } from "../../components/icons";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";
import { pullRequestPath } from "./paths";

const SOURCES = [
  { label: "GitHub pull request", value: "pull" },
  { label: "Branch", value: "branch" },
];

// Opens a pull request here from a GitHub pull request or branch, for the
// server to group. Offered only when the repository is connected to GitHub,
// the server groups pull requests, and the person can write.
export const OpenFromGithubButton = ({ name }: { name: string }) => {
  const [opened, setOpened] = useState(false);
  const { data } = useQuery(
    orpc.pullRequests.fromGithub.available.queryOptions({ input: { name } }),
  );
  if (!data?.available) {
    return null;
  }
  return (
    <>
      <Button
        variant="default"
        leftSection={<BranchIcon />}
        onClick={() => setOpened(true)}
      >
        Open from GitHub
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Open a pull request from GitHub"
        centered
        size="lg"
      >
        <OpenFromGithubForms name={name} />
      </Modal>
    </>
  );
};

const OpenFromGithubForms = ({ name }: { name: string }) => {
  const [source, setSource] = useState("pull");
  const open = useOpen(name);
  return (
    <Stack>
      <SegmentedControl data={SOURCES} value={source} onChange={setSource} />
      {source === "pull" ? (
        <PullForm name={name} open={open} />
      ) : (
        <BranchSource name={name} open={open} />
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
  const { data, isFetching, error } = useQuery(
    orpc.pullRequests.fromGithub.pulls.queryOptions({ input: { name } }),
  );
  const submit = submitter(form, (values: typeof form.values) =>
    open({ kind: "pull", number: Number(values.number) }),
  );
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <FormSelect
          name="number"
          label="GitHub pull request"
          searchable
          data={(data ?? []).map(pullOption)}
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

// The branch form, once the repository's branches are known.
const BranchSource = ({ name, open }: { name: string; open: Open }) => {
  const { data } = useQuery(
    orpc.repositories.branches.queryOptions({ input: { name } }),
  );
  return data ? (
    <BranchForm branches={data} open={open} />
  ) : (
    <Group justify="center" py={24}>
      <Loader size="sm" />
    </Group>
  );
};

const BranchForm = ({
  branches,
  open,
}: {
  branches: BranchInfo[];
  open: Open;
}) => {
  const names = branches.map((branch) => branch.name);
  const form = useForm({
    initialValues: {
      branch: "",
      targetBranch: branches.find((branch) => branch.isDefault)?.name ?? "",
      title: "",
    },
    schema: branchSchema,
  });
  const submit = submitter(form, (values: typeof form.values) =>
    open({ kind: "branch", ...values, title: values.title.trim() }),
  );
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack>
        <FormSelect
          name="branch"
          label="Branch"
          searchable
          data={names}
          description="Branches synced from GitHub"
          data-autofocus
        />
        <FormSelect
          name="targetBranch"
          label="Merge into"
          searchable
          data={names}
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
    await queryClient.invalidateQueries({
      queryKey: orpc.pullRequests.list.key(),
    });
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

function pullOption(pull: GithubPullOption) {
  return {
    value: String(pull.number),
    label: `#${pull.number} ${pull.title} (${pull.branch} → ${pull.targetBranch})`,
  };
}
