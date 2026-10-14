import {
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Rule,
  RuleAction,
  RuleConstruct,
  RuleInput,
  RuleWorkflow,
} from "@lib/contract";
import { palette } from "@lib/ds";
import { errorMessage } from "../../../../logic/api/errors";
import { orpc } from "../../../../logic/api/orpc";
import { timeAgo } from "../../../../logic/time";
import { useRepository } from "../../RepositoryLayout";
import { SkeletonCards } from "../../../../components/skeletons";

interface Draft {
  name: string;
  kind: "pattern" | "prompt";
  pattern: "files" | "structure";
  syntax: "glob" | "regex";
  patterns: string;
  constructs: RuleConstruct[];
  paths: string;
  prompt: string;
  action: RuleAction;
  reviewers: string[];
  workflow: RuleWorkflow | null;
  enabled: boolean;
}

const EMPTY: Draft = {
  name: "",
  kind: "pattern",
  pattern: "files",
  syntax: "glob",
  patterns: "",
  constructs: ["imports"],
  paths: "",
  prompt: "",
  action: "auto-accept",
  reviewers: [],
  workflow: null,
  enabled: true,
};

function draftOf(rule: Rule): Draft {
  const { match } = rule;
  return {
    ...EMPTY,
    name: rule.name,
    kind: match.kind === "prompt" ? "prompt" : "pattern",
    pattern: match.kind === "structure" ? "structure" : "files",
    syntax: match.kind === "files" ? match.syntax : "glob",
    patterns: match.kind === "files" ? match.patterns.join("\n") : "",
    constructs: match.kind === "structure" ? match.constructs : ["imports"],
    paths: match.kind === "files" ? "" : match.paths.join("\n"),
    prompt: match.kind === "prompt" ? match.prompt : "",
    action: rule.action,
    reviewers: rule.reviewers.map((r) => r.id),
    workflow: rule.workflow,
    enabled: rule.enabled,
  };
}

const lines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);

function inputOf(draft: Draft): RuleInput {
  return {
    name: draft.name,
    match:
      draft.kind === "prompt"
        ? { kind: "prompt", prompt: draft.prompt, paths: lines(draft.paths) }
        : draft.pattern === "files"
          ? {
              kind: "files",
              syntax: draft.syntax,
              patterns: lines(draft.patterns),
            }
          : {
              kind: "structure",
              constructs: draft.constructs,
              paths: lines(draft.paths),
            },
    action: draft.action,
    reviewers: draft.reviewers,
    workflow: draft.action === "run-workflow" ? draft.workflow : null,
    enabled: draft.enabled,
  };
}

// New rule at settings/rules/new, a rule's own page at settings/rules/:id.
export const RuleScreen = () => {
  const { id } = useParams();
  const { name } = useRepository();
  const { data: rule } = useQuery(
    orpc.repositories.rules.get.queryOptions({
      input: { name, id: id ?? "" },
      enabled: id !== "new",
    }),
  );
  if (id !== "new" && !rule) {
    return <SkeletonCards count={2} />;
  }
  return <RuleForm key={rule?.id ?? "new"} rule={rule} />;
};

const RuleForm = ({ rule }: { rule?: Rule }) => {
  const { name } = useRepository();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(rule ? draftOf(rule) : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: access } = useQuery(
    orpc.repositories.members.list.queryOptions({ input: { name } }),
  );
  const set = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const back = `/r/${name}/settings/rules`;
  const done = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.repositories.rules.key(),
    });
    navigate(back);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = { name, rule: inputOf(draft) };
      if (rule) {
        await orpc.repositories.rules.update.call({ ...input, id: rule.id });
      } else {
        await orpc.repositories.rules.create.call(input);
      }
      await done();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await orpc.repositories.rules.delete.call({ name, id: rule!.id });
      await done();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  };
  return (
    <Stack gap={16}>
      <Section
        title={rule ? rule.name : "New rule"}
        meta={
          rule &&
          (rule.lastMatched
            ? `Matched ${rule.recent.matched} of the last ${rule.recent.of} pull requests · last in #${rule.lastMatched.number}, ${timeAgo(rule.lastMatched.at)}`
            : "Has not matched a pull request yet")
        }
      >
        <TextInput
          label="Name"
          description="Shown as the bracket title in every review it matches."
          inputWrapperOrder={["label", "input", "description"]}
          value={draft.name}
          onChange={(e) => set({ name: e.currentTarget.value })}
        />
        <Choice
          label="Kind"
          value={draft.kind}
          onChange={(kind) => set({ kind })}
          options={[
            {
              value: "pattern",
              title: "Pattern match",
              text: "By file name or by code structure. Deterministic and instant.",
            },
            {
              value: "prompt",
              title: "Prompt",
              text: "The agent judges each change against your words. Slower, and good for intent.",
            },
          ]}
        />
      </Section>
      {draft.kind === "pattern" ? (
        <Section title="Match">
          <Choice
            value={draft.pattern}
            onChange={(pattern) => set({ pattern })}
            options={[
              {
                value: "files",
                title: "File names",
                text: "Every change in a file whose path matches.",
              },
              {
                value: "structure",
                title: "Code structure",
                text: "Changes whose lines all sit inside chosen constructs. JavaScript and TypeScript only for now.",
              },
            ]}
          />
          {draft.pattern === "files" ? (
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  Patterns
                </Text>
                <SegmentedControl
                  size="xs"
                  aria-label="Pattern syntax"
                  value={draft.syntax}
                  onChange={(v) => set({ syntax: v as Draft["syntax"] })}
                  data={[
                    { value: "glob", label: "Glob" },
                    { value: "regex", label: "Regex" },
                  ]}
                />
              </Group>
              <Textarea
                aria-label="Patterns"
                autosize
                minRows={1}
                ff="monospace"
                styles={{
                  input: { fontFamily: "var(--mantine-font-family-monospace)" },
                }}
                value={draft.patterns}
                onChange={(e) => set({ patterns: e.currentTarget.value })}
              />
              <Text size="xs" c="dimmed">
                {draft.syntax === "glob"
                  ? "One per line, relative to the repository root. ** crosses folders."
                  : "One per line, each searched for anywhere in the path."}
              </Text>
            </Stack>
          ) : (
            <>
              <Stack gap={8}>
                <Text size="sm" fw={500}>
                  Constructs
                </Text>
                <Checkbox.Group
                  value={draft.constructs}
                  onChange={(v) => set({ constructs: v as RuleConstruct[] })}
                >
                  <Stack gap={10}>
                    <Checkbox
                      value="imports"
                      label="Import statements"
                      description="import, export … from, and require() lines. Adding, removing or reordering them."
                    />
                    <Checkbox
                      value="comments"
                      label="Comments"
                      description="Line and block comments, JSDoc included. A change that also touches code does not match."
                    />
                  </Stack>
                </Checkbox.Group>
              </Stack>
              <Paths draft={draft} set={set} />
            </>
          )}
        </Section>
      ) : (
        <Section title="Prompt">
          <Textarea
            label="What to look for"
            description="Read by the agent that processes each pull request. Say what to look for, not what to do; the action below decides that. The matched lines are listed in the review so you can check the agent's reading."
            inputWrapperOrder={["label", "input", "description"]}
            autosize
            minRows={2}
            value={draft.prompt}
            onChange={(e) => set({ prompt: e.currentTarget.value })}
          />
          <Paths draft={draft} set={set} />
        </Section>
      )}
      <Section title="Action">
        <Choice
          columns={1}
          value={draft.action}
          onChange={(action) => set({ action })}
          options={[
            {
              value: "auto-accept",
              title: "Auto-accept",
              text: "Matched changes count as accepted for everyone and fold away in the code. Anyone can toggle one back to review it; it then carries their own accept.",
            },
            {
              value: "high-impact",
              title: "Mark as high impact",
              text: "Matched changes are striped grey and red until someone accepts them, and never fold away.",
            },
            {
              value: "require-review",
              title: "Require review by",
              text: "The pull request waits on the people below until one of them has accepted every matched change.",
            },
            {
              value: "run-workflow",
              title: "Run a workflow",
              text: "Starts a GitHub Actions workflow, such as a security audit, on the pull request's branch for every revision that matches. It needs a workflow_dispatch trigger and the pull request in GitHub.",
            },
          ]}
        />
        {draft.action === "require-review" && (
          <MultiSelect
            ml={36}
            label="Reviewers"
            description="Members of this repository. Someone who loses access is skipped."
            inputWrapperOrder={["label", "input", "description"]}
            placeholder="Add a person"
            searchable
            data={(access?.members ?? []).map((m) => ({
              value: m.user.id,
              label: m.user.name,
            }))}
            value={draft.reviewers}
            onChange={(reviewers) => set({ reviewers })}
          />
        )}
        {draft.action === "run-workflow" && (
          <WorkflowPicker
            value={draft.workflow}
            onChange={(workflow) => set({ workflow })}
          />
        )}
      </Section>
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      <Group>
        <Button onClick={save} loading={busy}>
          {rule ? "Save rule" : "Create rule"}
        </Button>
        <Button variant="default" onClick={() => navigate(back)}>
          Cancel
        </Button>
        {rule && (
          <Button
            ml="auto"
            color="red"
            variant="outline"
            onClick={() => setDeleting(true)}
          >
            Delete rule
          </Button>
        )}
      </Group>
      {rule && (
        <Modal
          opened={deleting}
          onClose={() => setDeleting(false)}
          title={`Delete ${rule.name}?`}
          radius={10}
        >
          <Stack>
            <Text size="sm">
              Pull requests processed already keep it in their review; new ones
              no longer run it.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button color="red" onClick={remove}>
                Delete rule
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
};

// The connected GitHub repository's workflows; without a connection there
// are none to pick.
const WorkflowPicker = ({
  value,
  onChange,
}: {
  value: RuleWorkflow | null;
  onChange: (workflow: RuleWorkflow | null) => void;
}) => {
  const { name } = useRepository();
  const { data: connection, isLoading } = useQuery(
    orpc.repositories.github.get.queryOptions({ input: { name } }),
  );
  const { data: workflows, error } = useQuery(
    orpc.repositories.github.workflows.queryOptions({
      input: { name },
      enabled: !!connection,
    }),
  );
  if (!isLoading && !connection) {
    return (
      <Text ml={36} size="sm" c="red">
        Connect this repository to GitHub under Settings › GitHub to run its
        workflows.
      </Text>
    );
  }
  return (
    <Select
      ml={36}
      label="Workflow"
      description={
        error
          ? errorMessage(error)
          : "From the connected GitHub repository's .github/workflows."
      }
      inputWrapperOrder={["label", "input", "description"]}
      placeholder="Pick a workflow"
      data={(workflows ?? []).map((w) => ({
        value: String(w.id),
        label: `${w.name} (${w.path})`,
      }))}
      value={value ? String(value.id) : null}
      onChange={(id) => {
        const picked = workflows?.find((w) => String(w.id) === id);
        onChange(
          picked
            ? { id: picked.id, name: picked.name, path: picked.path }
            : null,
        );
      }}
    />
  );
};

const Paths = ({
  draft,
  set,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
}) => (
  <Textarea
    label="Only in files matching"
    description={`Optional. One glob per line, such as web/**, keeps the rule to part of the repository${draft.kind === "prompt" ? " and makes it cheaper" : ""}.`}
    inputWrapperOrder={["label", "input", "description"]}
    autosize
    minRows={1}
    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
    value={draft.paths}
    onChange={(e) => set({ paths: e.currentTarget.value })}
  />
);

const Section = ({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) => (
  <Paper withBorder radius="md" p={18}>
    <Stack gap={14}>
      <Group gap={10} align="baseline">
        <Title order={3} fz={16} fw={600}>
          {title}
        </Title>
        {meta && (
          <Text size="xs" c={palette.muted}>
            {meta}
          </Text>
        )}
      </Group>
      {children}
    </Stack>
  </Paper>
);

// Radio cards: one option per card, the chosen one tinted.
function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 2,
}: {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; title: string; text: string }[];
  columns?: number;
}) {
  return (
    <Radio.Group label={label} value={value} onChange={(v) => onChange(v as T)}>
      <SimpleGrid cols={columns} spacing={10} mt={label ? 6 : 0}>
        {options.map((option) => (
          <Radio.Card
            key={option.value}
            value={option.value}
            radius={8}
            p={14}
            style={
              option.value === value
                ? {
                    borderColor: palette.accentRing,
                    background: palette.accentSoft,
                  }
                : undefined
            }
          >
            <Group gap={12} wrap="nowrap" align="start">
              <Radio.Indicator mt={2} />
              <Stack gap={2}>
                <Text size="sm" fw={500}>
                  {option.title}
                </Text>
                <Text size="xs" c={palette.secondary}>
                  {option.text}
                </Text>
              </Stack>
            </Group>
          </Radio.Card>
        ))}
      </SimpleGrid>
    </Radio.Group>
  );
}
