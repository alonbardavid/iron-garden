import { notifications } from "@mantine/notifications";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  Activity,
  Comment,
  CommentKind,
  PullRequestDetail,
  ReviewVerdict,
} from "@lib/contract";
import { errorMessage } from "../../logic/api/errors";
import { orpc } from "../../logic/api/orpc";

// Agents answer on their own time; their replies show up within this.
const COMMENTS_POLL_MS = 20_000;

// A comment on lines and the replies under it, oldest first.
export interface Thread {
  root: Comment;
  replies: Comment[];
}

export interface NewComment {
  kind: CommentKind;
  path: string;
  start: number;
  end: number;
  body: string;
}

export interface Discussion {
  // Undefined until loaded.
  comments?: Comment[];
  activity?: Activity;
  threads: Thread[];
  // Your comments that go out with your review.
  drafts: Comment[];
  create: (comment: NewComment) => Promise<Comment>;
  reply: (parent: string, body: string) => Promise<Comment>;
  send: (comment: string) => void;
  resolve: (comment: string, resolved: boolean) => void;
  remove: (comment: string) => void;
  submitReview: (review: {
    verdict: ReviewVerdict;
    body: string;
  }) => Promise<unknown>;
}

const DiscussionContext = createContext<Discussion | null>(null);

// The pull request's comments, commits, transcripts and reviews, for every
// tab to show and add to.
export const DiscussionProvider = ({
  pr,
  children,
}: {
  pr: PullRequestDetail;
  children: ReactNode;
}) => {
  const value = useDiscussionState(pr);
  return (
    <DiscussionContext.Provider value={value}>
      {children}
    </DiscussionContext.Provider>
  );
};

// Null where no pull request's discussion is loaded.
export function useOptionalDiscussion(): Discussion | null {
  return useContext(DiscussionContext);
}

export function useDiscussion(): Discussion {
  const value = useContext(DiscussionContext);
  if (!value) {
    throw new Error("useDiscussion outside a DiscussionProvider");
  }
  return value;
}

function useDiscussionState(pr: PullRequestDetail): Discussion {
  const input = { name: pr.repository, number: pr.number };
  const { data: comments } = useQuery(
    orpc.pullRequests.comments.list.queryOptions({
      input,
      refetchInterval: COMMENTS_POLL_MS,
    }),
  );
  const { data: activity } = useQuery(
    orpc.pullRequests.activity.get.queryOptions({
      input,
      queryKey: activityKey(pr),
    }),
  );
  const mutations = useCommentMutations(pr);
  const threads = useMemo(() => threadsOf(comments ?? []), [comments]);
  const drafts = useMemo(
    () => (comments ?? []).filter((c) => c.status === "draft" && c.mine),
    [comments],
  );
  return { comments, activity, threads, drafts, ...mutations };
}

const activityKey = (pr: PullRequestDetail): QueryKey => [
  "pull-request-activity",
  pr.id,
  pr.headCommit,
];

function useCommentMutations(pr: PullRequestDetail) {
  const queryClient = useQueryClient();
  const input = { name: pr.repository, number: pr.number };
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.pullRequests.comments.key(),
    });
  const options = {
    onSuccess: refresh,
    onError: (err: Error) =>
      notifications.show({ color: "red", message: errorMessage(err) }),
  };
  const create = useMutation(
    orpc.pullRequests.comments.create.mutationOptions(options),
  );
  const send = useMutation(
    orpc.pullRequests.comments.send.mutationOptions(options),
  );
  const resolve = useMutation(
    orpc.pullRequests.comments.resolve.mutationOptions(options),
  );
  const remove = useMutation(
    orpc.pullRequests.comments.delete.mutationOptions(options),
  );
  const review = useMutation(
    orpc.pullRequests.activity.submitReview.mutationOptions({
      ...options,
      onSuccess: async () => {
        await refresh();
        await queryClient.invalidateQueries({ queryKey: activityKey(pr) });
      },
    }),
  );
  return {
    create: (comment: NewComment) =>
      create.mutateAsync({ ...input, ...comment }),
    reply: (parent: string, body: string) =>
      create.mutateAsync({ ...input, parent, body }),
    send: (comment: string) => send.mutate({ ...input, comment }),
    resolve: (comment: string, resolved: boolean) =>
      resolve.mutate({ ...input, comment, resolved }),
    remove: (comment: string) => remove.mutate({ ...input, comment }),
    submitReview: (body: { verdict: ReviewVerdict; body: string }) =>
      review.mutateAsync({ ...input, ...body }),
  };
}

export function threadsOf(comments: Comment[]): Thread[] {
  const replies = new Map<string, Comment[]>();
  for (const comment of comments) {
    if (comment.parent) {
      replies.set(comment.parent, [
        ...(replies.get(comment.parent) ?? []),
        comment,
      ]);
    }
  }
  return comments
    .filter((c) => !c.parent)
    .map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
}
