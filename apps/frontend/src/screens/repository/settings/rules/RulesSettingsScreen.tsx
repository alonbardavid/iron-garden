import {
  Avatar,
  Box,
  Button,
  Group,
  Stack,
  Switch,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Rule } from "@lib/contract";
import { palette } from "@lib/ds";
import { initials } from "../../../../components/AppHeader";
import { Card } from "../../../../components/Card";
import board from "../../../../components/board.module.css";
import { errorMessage } from "../../../../logic/api/errors";
import { orpc } from "../../../../logic/api/orpc";
import { actionSummary, matchSummary } from "../../../../logic/rules";
import { timeAgo } from "../../../../logic/time";
import { RuleSwatch } from "../../../pull-requests/diff/rows";
import { useRepository } from "../../RepositoryLayout";
import { CopyRulesModal } from "./CopyRulesModal";
import { SkeletonRows } from "../../../../components/skeletons";

// The repository's rules: what each matches and does, when it last matched,
// and a switch to turn it off. ?copy opens the copy dialog.
export const RulesSettingsScreen = () => {
  const { name } = useRepository();
  const [search, setSearch] = useSearchParams();
  const { data: rules } = useQuery(
    orpc.repositories.rules.list.queryOptions({ input: { name } }),
  );
  const copying = search.has("copy");
  return (
    <Stack gap={16}>
      <Card>
        <Group justify="space-between">
          <Text fz={16} fw={600}>
            Rules
          </Text>
          <Group gap={8}>
            <Button variant="default" onClick={() => setSearch({ copy: "" })}>
              Copy from another repository
            </Button>
            <Button component={Link} to={`/r/${name}/settings/rules/new`}>
              New rule
            </Button>
          </Group>
        </Group>
        <Text size="sm" c={palette.body}>
          Rules run when a pull request is processed. Each rule that matches
          becomes its own bracket in the review, and its action applies to every
          change it matched.
        </Text>
        {rules && rules.length === 0 ? (
          <Text size="sm" c="dimmed" py={12}>
            No rules yet. Start with one that auto-accepts generated files or
            lockfiles, or copy rules from another repository.
          </Text>
        ) : (
          <Table verticalSpacing={8} aria-label="Rules">
            <Table.Thead>
              <Table.Tr>
                <Table.Th fz={12}>Rule</Table.Th>
                <Table.Th fz={12} w={200}>
                  Action
                </Table.Th>
                <Table.Th fz={12} w={150}>
                  Last matched
                </Table.Th>
                <Table.Th fz={12} w={48}>
                  On
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rules?.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </Table.Tbody>
          </Table>
        )}
        {!rules && <SkeletonRows rows={3} meta={false} />}
        <Text size="xs" c={palette.muted}>
          Order does not matter. A change matched by several rules keeps every
          action: it can be auto-accepted by one rule and still need a named
          reviewer from another.
        </Text>
      </Card>
      <Card title="How rules are shown in a review">
        <Stack gap={8}>
          <Explained icon={<RuleSwatch action="auto-accept" />}>
            Auto-accepted changes fold away in the code and count as accepted;
            the striped blue part of a progress bar is theirs.
          </Explained>
          <Explained icon={<RuleSwatch action="high-impact" />}>
            High-impact changes stay striped grey and red until someone accepts
            them, and never fold away.
          </Explained>
          <Explained icon={<RuleSwatch action="require-review" />}>
            A rule with named reviewers keeps the pull request waiting on them
            until one of them accepts every matched change.
          </Explained>
          <Explained icon={<RuleSwatch action="require-review" />}>
            Pointing at an auto-accepted or high-impact line anywhere in the
            code names the rule behind it and links to its bracket.
          </Explained>
        </Stack>
      </Card>
      {copying && (
        <CopyRulesModal
          from={search.get("copy") || null}
          onFrom={(from) => setSearch({ copy: from ?? "" }, { replace: true })}
          onClose={() => setSearch({})}
        />
      )}
    </Stack>
  );
};

const Explained = ({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) => (
  <Group gap={10} wrap="nowrap" align="start">
    <Box pt={4}>{icon}</Box>
    <Text size="sm" c={palette.body}>
      {children}
    </Text>
  </Group>
);

const RuleRow = ({ rule }: { rule: Rule }) => {
  const { name } = useRepository();
  const queryClient = useQueryClient();
  const toggle = async (enabled: boolean) => {
    try {
      await orpc.repositories.rules.setEnabled.call({
        name,
        id: rule.id,
        enabled,
      });
    } catch (err) {
      notifications.show({ color: "red", message: errorMessage(err) });
    }
    await queryClient.invalidateQueries({
      queryKey: orpc.repositories.rules.key(),
    });
  };
  return (
    <Table.Tr>
      <Table.Td maw={0} w="100%">
        <UnstyledButton
          component={Link}
          to={`/r/${name}/settings/rules/${rule.id}`}
          className={board.ghost}
          display="block"
          px={6}
          mx={-6}
          py={2}
          style={{ borderRadius: 5 }}
        >
          <Text size="sm" fw={500} c={palette.ink}>
            {rule.name}
          </Text>
          <Text size="xs" c={palette.muted} truncate>
            {matchSummary(rule.match)}
          </Text>
        </UnstyledButton>
      </Table.Td>
      <Table.Td>
        <Group gap={8} wrap="nowrap">
          {rule.action === "require-review" ? (
            <Avatar
              size={20}
              radius="xl"
              fz={9}
              styles={{
                placeholder: {
                  background: palette.warningSoft,
                  color: palette.warningInk,
                },
              }}
            >
              {initials(rule.reviewers[0]?.name ?? "?")}
            </Avatar>
          ) : (
            <RuleSwatch action={rule.action} />
          )}
          <Text size="sm" truncate>
            {actionSummary(rule)}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={palette.muted}>
          {rule.lastMatched
            ? `#${rule.lastMatched.number}, ${timeAgo(rule.lastMatched.at)}`
            : "Not yet"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Switch
          aria-label={`${rule.name} is on`}
          checked={rule.enabled}
          onChange={(e) => void toggle(e.currentTarget.checked)}
        />
      </Table.Td>
    </Table.Tr>
  );
};
