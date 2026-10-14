import { Group, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PullRequestDetail, Review, ReviewRule } from "@lib/contract";
import { palette } from "@lib/ds";
import board from "../../components/board.module.css";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";
import { RuleSwatch } from "./diff/rows";
import { pullRequestPath } from "./paths";
import {
  marksOf,
  requests,
  sweepsHighImpact,
  withAccepted,
  type ChangeRef,
  type Marks,
} from "./progress";

export interface ReviewMarks {
  // Undefined until the pull request's changes are loaded.
  marks?: Marks;
  accept: (changes: ChangeRef[], accepted: boolean) => void;
  // A rule's bracket on the Brackets tab.
  ruleLink: (rule: ReviewRule) => string;
}

const ReviewContext = createContext<ReviewMarks>({
  accept: () => undefined,
  ruleLink: () => "",
});

// The id of a rule's bracket on the Brackets tab.
export const ruleGroupId = (rule: { id: string }) => `rule-${rule.id}`;

// The changes you accepted in the pull request, for every tab to show and
// change. Accepting a selection that would sweep up high-impact changes with
// regular ones asks first.
export const ReviewProvider = ({
  pr,
  children,
}: {
  pr: PullRequestDetail;
  children: ReactNode;
}) => {
  const review = useReview(pr);
  const [sweep, setSweep] = useState<{
    changes: ChangeRef[];
    high: ChangeRef[];
  } | null>(null);
  const value: ReviewMarks = {
    marks: review.marks,
    ruleLink: (rule) =>
      pullRequestPath(pr, "brackets", { bracket: ruleGroupId(rule) }),
    accept: (changes, accepted) => {
      const high =
        accepted && review.marks && sweepsHighImpact(review.marks, changes);
      if (high) {
        setSweep({ changes, high });
      } else {
        review.accept(changes, accepted);
      }
    },
  };
  return (
    <ReviewContext.Provider value={value}>
      {children}
      {sweep && review.marks && (
        <SweepWarning
          marks={review.marks}
          {...sweep}
          onAccept={(changes) => {
            review.accept(changes, true);
            setSweep(null);
          }}
          onCancel={() => setSweep(null)}
        />
      )}
    </ReviewContext.Provider>
  );
};

const SweepWarning = ({
  marks,
  changes,
  high,
  onAccept,
  onCancel,
}: {
  marks: Marks;
  changes: ChangeRef[];
  high: ChangeRef[];
  onAccept: (changes: ChangeRef[]) => void;
  onCancel: () => void;
}) => {
  const pending = changes.filter((c) => !marks.isAccepted(c));
  const highIds = new Set(high.map((c) => `${c.path}\n${c.key}`));
  const regular = pending.filter((c) => !highIds.has(`${c.path}\n${c.key}`));
  const files = [...new Set(high.map((c) => c.path))].map((path) => {
    const inFile = high.filter((c) => c.path === path);
    return {
      path,
      count: inFile.length,
      rules: [
        ...new Set(
          inFile.flatMap((c) =>
            marks
              .rulesOf(c)
              .filter((r) => r.action === "high-impact")
              .map((r) => r.name),
          ),
        ),
      ],
    };
  });
  const n = (count: number) => (count === 1 ? "1 change" : `${count} changes`);
  return (
    <Modal
      opened
      onClose={onCancel}
      size={540}
      radius={10}
      withCloseButton={false}
      title={
        <Group gap={8}>
          <RuleSwatch action="high-impact" />
          <Text span fz={15} fw={600}>
            Accept high-impact changes too?
          </Text>
        </Group>
      }
    >
      <Stack gap={14}>
        <Text fz={13} c={palette.body}>
          This covers {n(pending.length)}. {high.length} of them{" "}
          {high.length === 1 ? "is" : "are"} high impact, meant to be accepted
          one at a time after reading each. Skipped ones stay striped until you
          accept them in place.
        </Text>
        <Stack
          gap={0}
          style={{ border: `1px solid ${palette.line}`, borderRadius: 6 }}
        >
          {files.map((file) => (
            <Group key={file.path} gap={10} h={36} px={12} wrap="nowrap">
              <Text ff="monospace" fz={12.5} truncate>
                {file.path}
              </Text>
              <Text fz={12} c={palette.muted} style={{ flexShrink: 0 }}>
                {n(file.count)}
              </Text>
              {file.rules.map((rule) => (
                <Group
                  key={rule}
                  gap={5}
                  ml="auto"
                  h={20}
                  px={8}
                  fz={11.5}
                  fw={500}
                  c={palette.dangerInk}
                  bg={palette.dangerSoft}
                  wrap="nowrap"
                  style={{ borderRadius: 10, flexShrink: 0 }}
                >
                  <RuleSwatch action="high-impact" />
                  {rule}
                </Group>
              ))}
            </Group>
          ))}
        </Stack>
        <Group gap={8}>
          <UnstyledButton
            className={board.primary}
            data-autofocus
            onClick={() => onAccept(regular)}
            h={32}
            px={12}
            fz={13}
            fw={600}
            c="white"
            bg={palette.accentFill}
            style={{ borderRadius: 5 }}
          >
            Accept the{" "}
            {regular.length === 1
              ? "regular change"
              : `${regular.length} regular changes`}
          </UnstyledButton>
          <UnstyledButton
            className={board.button}
            onClick={() => onAccept(pending)}
            h={32}
            px={12}
            fz={13}
            fw={500}
            style={{
              borderRadius: 5,
              border: `1px solid ${palette.control}`,
              background: palette.surface,
            }}
          >
            Accept all {pending.length}, high impact too
          </UnstyledButton>
          <UnstyledButton
            className={board.ghost}
            onClick={onCancel}
            ml="auto"
            h={32}
            px={10}
            fz={13}
            fw={500}
            c={palette.secondary}
            style={{ borderRadius: 5 }}
          >
            Cancel
          </UnstyledButton>
        </Group>
      </Stack>
    </Modal>
  );
};

export const useMarks = (): ReviewMarks => useContext(ReviewContext);

// Accepting shows on screen the moment you click and is saved behind it.
function useReview(
  pr: PullRequestDetail,
): Pick<ReviewMarks, "marks" | "accept"> {
  const queryClient = useQueryClient();
  const queryKey: QueryKey = ["pull-request-review", pr.id, pr.headCommit];
  const mutationKey = ["accept-changes", pr.id];
  const input = { name: pr.repository, number: pr.number };
  const { data } = useQuery(
    orpc.pullRequests.review.queryOptions({ input, queryKey }),
  );
  const marks = useMemo(() => data && marksOf(data), [data]);
  // Only the last of several quick clicks writes the server's answer back,
  // so an earlier answer never undoes a later click on screen.
  const last = () => queryClient.isMutating({ mutationKey }) === 1;
  const { mutate } = useMutation(
    orpc.pullRequests.accept.mutationOptions({
      mutationKey,
      onMutate: async ({ changes, accepted }) => {
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData<Review>(
          queryKey,
          (old) => old && withAccepted(old, changes, accepted),
        );
      },
      onSuccess: (review) => {
        if (last()) {
          queryClient.setQueryData(queryKey, review);
        }
      },
      onError: (err) => {
        notifications.show({ color: "red", message: errorMessage(err) });
        void queryClient.invalidateQueries({ queryKey });
      },
      onSettled: () => {
        if (last()) {
          void queryClient.invalidateQueries({
            queryKey: orpc.pullRequests.list.key(),
          });
        }
      },
    }),
  );
  return {
    marks,
    accept: (changes, accepted) => {
      for (const part of requests(changes)) {
        mutate({ ...input, accepted, changes: part });
      }
    },
  };
}
