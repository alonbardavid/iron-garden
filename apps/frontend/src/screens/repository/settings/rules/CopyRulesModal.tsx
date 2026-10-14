import {
  Button,
  Checkbox,
  Group,
  List,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Rule } from "@lib/contract";
import { palette } from "@lib/ds";
import { errorMessage } from "../../../../logic/api/errors";
import { orpc } from "../../../../logic/api/orpc";
import { actionSummary, matchSummary } from "../../../../logic/rules";
import { useRepository } from "../../RepositoryLayout";

const sameRule = (a: Rule, b: Rule) =>
  a.name === b.name && JSON.stringify(a.match) === JSON.stringify(b.match);

// Picks rules from another repository the person can read and copies them
// here. The repository picked is in the URL.
export const CopyRulesModal = ({
  from,
  onFrom,
  onClose,
}: {
  from: string | null;
  onFrom: (from: string | null) => void;
  onClose: () => void;
}) => {
  const { name } = useRepository();
  const queryClient = useQueryClient();
  const { data: repositories } = useQuery(
    orpc.repositories.list.queryOptions(),
  );
  const { data: ours } = useQuery(
    orpc.repositories.rules.list.queryOptions({ input: { name } }),
  );
  const { data: theirs } = useQuery(
    orpc.repositories.rules.list.queryOptions({
      input: { name: from ?? "" },
      enabled: !!from,
    }),
  );
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState<string[] | null>(null);
  const present = (rule: Rule) => !!ours?.some((r) => sameRule(r, rule));
  const copy = async () => {
    if (!from) {
      return;
    }
    setBusy(true);
    try {
      const copied = await orpc.repositories.rules.copy.call({
        name,
        from,
        ids: picked,
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.repositories.rules.key(),
      });
      if (copied.dropped.length > 0) {
        setDropped(copied.dropped);
      } else {
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  if (dropped) {
    return <DroppedRulesModal dropped={dropped} onClose={onClose} />;
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title="Copy rules from another repository"
      size={520}
      radius={10}
    >
      <Stack gap={14}>
        <Select
          label="Repository"
          placeholder="Pick a repository"
          data={(repositories ?? [])
            .filter((r) => r.name !== name)
            .map((r) => r.name)}
          value={from}
          onChange={(value) => {
            setPicked([]);
            onFrom(value);
          }}
          searchable
        />
        {from && theirs && (
          <Stack gap={0}>
            <Text size="xs" fw={600} c="dimmed" mb={4}>
              Rules in {from}
            </Text>
            {theirs.length === 0 && (
              <Text size="sm" c="dimmed">
                {from} has no rules.
              </Text>
            )}
            {theirs.map((rule) => {
              const already = present(rule);
              return (
                <Group
                  key={rule.id}
                  gap={10}
                  py={8}
                  wrap="nowrap"
                  style={{ borderTop: `1px solid ${palette.line}` }}
                >
                  <Checkbox
                    aria-label={rule.name}
                    checked={already || picked.includes(rule.id)}
                    disabled={already}
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setPicked((current) =>
                        on
                          ? [...current, rule.id]
                          : current.filter((id) => id !== rule.id),
                      );
                    }}
                  />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} c={already ? "dimmed" : undefined}>
                      {rule.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {matchSummary(rule.match)} · {actionSummary(rule)}
                    </Text>
                  </Stack>
                  {already && (
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      already in {name}
                    </Text>
                  )}
                </Group>
              );
            })}
          </Stack>
        )}
        <Text size="xs" c={palette.muted}>
          Copies are independent: later edits in {from ?? "that repository"} do
          not carry over, and reviewers are kept only if they are members here.
        </Text>
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end" gap={8}>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={copy} disabled={picked.length === 0} loading={busy}>
            Copy {picked.length === 1 ? "1 rule" : `${picked.length} rules`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

// Run-workflow rules start a workflow of this repository's GitHub
// repository, so one without the same workflow cannot be copied.
const DroppedRulesModal = ({
  dropped,
  onClose,
}: {
  dropped: string[];
  onClose: () => void;
}) => (
  <Modal
    opened
    onClose={onClose}
    title="Some rules were not copied"
    radius={10}
  >
    <Stack gap={12}>
      <Text size="sm">
        These rules run a GitHub workflow this repository does not have (or it
        is not connected to GitHub), so they were left out:
      </Text>
      <List size="sm">
        {dropped.map((rule) => (
          <List.Item key={rule}>{rule}</List.Item>
        ))}
      </List>
      <Group justify="flex-end">
        <Button onClick={onClose}>Got it</Button>
      </Group>
    </Stack>
  </Modal>
);
