import {
  Button,
  Checkbox,
  Group,
  List,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { CopyableRule } from "@lib/contract";
import { palette } from "@lib/ds";
import { SearchSelect } from "../../../../components/SearchSelect";
import { ShowMore } from "../../../../components/ShowMore";
import { errorMessage } from "../../../../logic/api/errors";
import { orpc } from "../../../../logic/api/orpc";
import { nextPage, usePagedList } from "../../../../logic/api/paging";
import { actionSummary, matchSummary } from "../../../../logic/rules";
import { useRepository } from "../../RepositoryLayout";

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
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState<string[] | null>(null);
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
        <SearchSelect
          label="Repository"
          placeholder="Search repositories"
          search={(q) =>
            orpc.repositories.search.queryOptions({
              input: { q },
              select: (found) => found.filter((r) => r.name !== name),
            })
          }
          toOption={(r) => ({ value: r.name, label: r.name })}
          initialOption={from ? { value: from, label: from } : null}
          value={from}
          onChange={(value) => {
            setPicked([]);
            onFrom(value);
          }}
        />
        {from && (
          <CopyableRules from={from} picked={picked} onPick={setPicked} />
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

// The rules of `from`, a page at a time, with a box to pick each; one this
// repository already has is ticked and cannot be picked.
const CopyableRules = ({
  from,
  picked,
  onPick,
}: {
  from: string;
  picked: string[];
  onPick: Dispatch<SetStateAction<string[]>>;
}) => {
  const { name } = useRepository();
  const rules = usePagedList(
    orpc.repositories.rules.copyable.infiniteOptions({
      input: (cursor) => ({ name, from, cursor }),
      ...nextPage,
    }),
  );
  if (!rules.items) {
    return null;
  }
  return (
    <Stack gap={0}>
      <Text size="xs" fw={600} c="dimmed" mb={4}>
        Rules in {from}
      </Text>
      {rules.items.length === 0 && (
        <Text size="sm" c="dimmed">
          {from} has no rules.
        </Text>
      )}
      {rules.items.map((rule) => (
        <CopyableRuleRow
          key={rule.id}
          rule={rule}
          picked={picked.includes(rule.id)}
          onPicked={(on) =>
            onPick((current) =>
              on
                ? [...current, rule.id]
                : current.filter((id) => id !== rule.id),
            )
          }
        />
      ))}
      <ShowMore list={rules} />
    </Stack>
  );
};

const CopyableRuleRow = ({
  rule,
  picked,
  onPicked,
}: {
  rule: CopyableRule;
  picked: boolean;
  onPicked: (on: boolean) => void;
}) => {
  const { name } = useRepository();
  return (
    <Group
      gap={10}
      py={8}
      wrap="nowrap"
      style={{ borderTop: `1px solid ${palette.line}` }}
    >
      <Checkbox
        aria-label={rule.name}
        checked={rule.already || picked}
        disabled={rule.already}
        onChange={(e) => onPicked(e.currentTarget.checked)}
      />
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500} c={rule.already ? "dimmed" : undefined}>
          {rule.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {matchSummary(rule.match)} · {actionSummary(rule)}
        </Text>
      </Stack>
      {rule.already && (
        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
          already in {name}
        </Text>
      )}
    </Group>
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
