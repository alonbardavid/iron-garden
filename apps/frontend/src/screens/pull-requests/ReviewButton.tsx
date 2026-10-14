import {
  Button,
  Group,
  Popover,
  Radio,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { z } from "zod";
import type { Comment, PullRequestDetail, ReviewVerdict } from "@lib/contract";
import {
  FormGeneralErrors,
  FormTextarea,
  GENERAL_ERROR_KEY,
  palette,
  StandardForm,
  useForm,
} from "@lib/ds";
import board from "../../components/board.module.css";
import { ChevronIcon, CommentIcon } from "../../components/icons";
import { errorMessage } from "../../logic/api/errors";
import { useDiscussion } from "./discussion";
import { useMarks } from "./review";

// Opens your review: how far through it you are, what goes out with it, and
// your verdict.
export const ReviewButton = ({ pr }: { pr: PullRequestDetail }) => {
  const { drafts } = useDiscussion();
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={380}
      shadow="md"
      radius={10}
      trapFocus
    >
      <Popover.Target>
        <UnstyledButton
          className={board.primary}
          aria-label={`Review, ${drafts.length} pending`}
          onClick={() => setOpened((o) => !o)}
          h={32}
          px={12}
          fz={13}
          fw={600}
          c="white"
          bg={palette.accentFill}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 6,
          }}
        >
          Review
          <PendingCount count={drafts.length} />
          <ChevronIcon />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={16}>
        <ReviewForm pr={pr} drafts={drafts} onDone={() => setOpened(false)} />
      </Popover.Dropdown>
    </Popover>
  );
};

const PendingCount = ({ count }: { count: number }) =>
  count > 0 && (
    <Text
      span
      fz={11}
      fw={700}
      lh="18px"
      miw={18}
      ta="center"
      c={palette.accent}
      bg={palette.surface}
      style={{ borderRadius: 9 }}
    >
      {count}
    </Text>
  );

const schema = z.object({ body: z.string().trim().max(20_000) });

const VERDICTS: Record<
  ReviewVerdict,
  { label: string; detail: (agent: string) => string; submit: string }
> = {
  accept: {
    label: "Accept",
    detail: () => "The change can merge as it is.",
    submit: "Accept change",
  },
  changes: {
    label: "Request changes",
    detail: (agent) => `Send it back to ${agent} before it can merge.`,
    submit: "Request changes",
  },
};

const ReviewForm = ({
  pr,
  drafts,
  onDone,
}: {
  pr: PullRequestDetail;
  drafts: Comment[];
  onDone: () => void;
}) => {
  const [verdict, setVerdict] = useState<ReviewVerdict>(
    drafts.some((d) => d.kind === "flag") ? "changes" : "accept",
  );
  const { form, submit } = useReviewForm(verdict, onDone);
  return (
    <StandardForm form={form} onSubmit={submit}>
      <Stack gap={14}>
        <ReviewProgress />
        <OutgoingComments drafts={drafts} />
        <VerdictPicker
          verdict={verdict}
          onChange={setVerdict}
          agent={pr.agent?.name ?? "the agent"}
        />
        <FormTextarea
          name="body"
          aria-label="Note"
          placeholder="A note on the whole change (optional)"
          autosize
          minRows={2}
          maxRows={8}
        />
        <FormGeneralErrors />
        <Group justify="flex-end" gap={8}>
          <Button variant="default" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {VERDICTS[verdict].submit}
          </Button>
        </Group>
      </Stack>
    </StandardForm>
  );
};

// Sends the review with its note, and says so.
function useReviewForm(verdict: ReviewVerdict, onDone: () => void) {
  const { submitReview } = useDiscussion();
  const form = useForm({ initialValues: { body: "" }, schema });
  const submit = async ({ body }: typeof form.values) => {
    try {
      await submitReview({ verdict, body: body.trim() });
    } catch (err) {
      form.setFieldError(GENERAL_ERROR_KEY, errorMessage(err));
      return;
    }
    notifications.show({ message: "Your review went out." });
    form.reset();
    onDone();
  };
  return { form, submit };
}

const VerdictPicker = ({
  verdict,
  onChange,
  agent,
}: {
  verdict: ReviewVerdict;
  onChange: (verdict: ReviewVerdict) => void;
  agent: string;
}) => (
  <Radio.Group
    value={verdict}
    onChange={(v) => onChange(v as ReviewVerdict)}
    aria-label="Verdict"
  >
    <Stack gap={12}>
      {(Object.keys(VERDICTS) as ReviewVerdict[]).map((v) => (
        <Radio
          key={v}
          value={v}
          label={VERDICTS[v].label}
          description={VERDICTS[v].detail(agent)}
        />
      ))}
    </Stack>
  </Radio.Group>
);

const ReviewProgress = () => {
  const { marks } = useMarks();
  const progress = marks?.progress(marks.all());
  return (
    <Group justify="space-between" align="baseline">
      <Text fz={15} fw={600}>
        Your review
      </Text>
      {progress && (
        <Text fz={12.5} c={palette.muted}>
          {progress.accepted} of {progress.total} changes accepted
        </Text>
      )}
    </Group>
  );
};

const OutgoingComments = ({ drafts }: { drafts: Comment[] }) =>
  drafts.length > 0 && (
    <Group
      gap={8}
      px={10}
      py={8}
      fz={12.5}
      c={palette.body}
      bg={palette.panel}
      wrap="nowrap"
      style={{ borderRadius: 6 }}
    >
      <Text span c={palette.accent} display="flex">
        <CommentIcon />
      </Text>
      {outgoingText(drafts)} with this review
    </Group>
  );

// "1 flag and 2 comments go out".
export function outgoingText(drafts: Comment[]): string {
  const flags = drafts.filter((d) => d.kind === "flag").length;
  const others = drafts.length - flags;
  const parts = [
    ...(flags > 0 ? [flags === 1 ? "1 flag" : `${flags} flags`] : []),
    ...(others > 0 ? [others === 1 ? "1 comment" : `${others} comments`] : []),
  ];
  return `${parts.join(" and ")} ${drafts.length === 1 ? "goes" : "go"} out`;
}
