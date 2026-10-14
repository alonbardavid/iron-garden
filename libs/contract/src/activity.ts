import { oc } from "@orpc/contract";
import { z } from "zod";
import { okSchema } from "./review";

// Mirror the enums in @lib/db-models, which store them.
export const TRANSCRIPT_SOURCES = ["api", "trailer"] as const;
export const COMMENT_KINDS = ["comment", "flag", "accept", "ask"] as const;
export const COMMENT_STATUSES = ["draft", "sent"] as const;
export const REVIEW_VERDICTS = ["accept", "changes"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

// The trailer that names a commit's transcript: an uploaded transcript's id,
// or the path of a transcript file in the commit.
export const TRANSCRIPT_TRAILER = "Agent-Transcript";

// The most entries one transcript holds; a longer session is split by commit.
export const MAX_TRANSCRIPT_ENTRIES = 2000;

const sha = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "A full, lowercase 40-character commit id");

// A person's prompt, or what the agent said and the tools it ran on the way.
export const transcriptEntrySchema = z.object({
  role: z.enum(["user", "agent"]),
  author: z.string().trim().max(200).optional(),
  text: z.string().max(50_000),
  tools: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        target: z.string().max(1000),
      }),
    )
    .max(200)
    .optional(),
});
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

export const transcriptSummarySchema = z.object({
  id: z.string(),
  // Null until a commit names it in its trailer.
  commit: z.string().nullable(),
  source: z.enum(TRANSCRIPT_SOURCES),
  entries: z.number(),
  createdAt: z.number(),
});
export type TranscriptSummary = z.infer<typeof transcriptSummarySchema>;

export const transcriptSchema = transcriptSummarySchema
  .omit({ entries: true })
  .extend({ entries: z.array(transcriptEntrySchema) });
export type Transcript = z.infer<typeof transcriptSchema>;

export const pullRequestCommitSchema = z.object({
  sha: z.string(),
  title: z.string(),
  message: z.string(),
  author: z.string(),
  committedAt: z.number(),
  transcript: transcriptSummarySchema.nullable(),
});
export type PullRequestCommit = z.infer<typeof pullRequestCommitSchema>;

const person = z.object({ id: z.string(), name: z.string() });

export const reviewSessionSchema = z.object({
  id: z.string(),
  author: person.nullable(),
  verdict: z.enum(REVIEW_VERDICTS),
  body: z.string().nullable(),
  revision: z.number(),
  accepted: z.number(),
  total: z.number(),
  createdAt: z.number(),
});
export type ReviewSession = z.infer<typeof reviewSessionSchema>;

export const activitySchema = z.object({
  commits: z.array(pullRequestCommitSchema),
  reviews: z.array(reviewSessionSchema),
});
export type Activity = z.infer<typeof activitySchema>;

export const commentAuthorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id: z.string(), name: z.string() }),
  z.object({
    kind: z.literal("agent"),
    id: z.string(),
    name: z.string(),
    ownerName: z.string().nullable(),
  }),
]);
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

// A comment on lines, or a reply to one (parent set; no kind or lines). A
// draft is seen only by its author until it goes out.
export const commentSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  author: commentAuthorSchema.nullable(),
  mine: z.boolean(),
  kind: z.enum(COMMENT_KINDS).nullable(),
  path: z.string().nullable(),
  start: z.number().nullable(),
  end: z.number().nullable(),
  body: z.string(),
  revision: z.number(),
  headCommit: z.string(),
  status: z.enum(COMMENT_STATUSES),
  review: z.string().nullable(),
  resolved: z
    .object({ by: person.nullable(), at: z.number(), commit: z.string() })
    .nullable(),
  sentAt: z.number().nullable(),
  createdAt: z.number(),
});
export type Comment = z.infer<typeof commentSchema>;

const byPullRequest = z.object({
  name: z.string(),
  number: z.coerce.number<number>().int().min(1),
});
const byComment = byPullRequest.extend({ comment: z.string() });

const base = "/api/repositories/{name}/pull-requests/{number}";

export const activityContract = {
  get: oc
    .route({ method: "GET", path: `${base}/activity` })
    .input(byPullRequest)
    .output(activitySchema),
  transcript: oc
    .route({ method: "GET", path: `${base}/transcripts/{transcript}` })
    .input(byPullRequest.extend({ transcript: z.string() }))
    .output(transcriptSchema),
  submitReview: oc
    .route({ method: "POST", path: `${base}/reviews` })
    .input(
      byPullRequest.extend({
        verdict: z.enum(REVIEW_VERDICTS),
        body: z.string().trim().max(20_000).nullable().optional(),
      }),
    )
    .output(reviewSessionSchema),
};

export const commentsContract = {
  list: oc
    .route({ method: "GET", path: `${base}/comments` })
    .input(byPullRequest)
    .output(z.array(commentSchema)),
  // A comment on lines needs kind, path, start and end; a reply needs
  // parent. A person's comment, flag or accept stays a draft until their
  // review goes out unless `send` is set; an ask, a reply and anything an
  // agent writes go out at once.
  create: oc
    .route({ method: "POST", path: `${base}/comments` })
    .input(
      byPullRequest.extend({
        parent: z.string().optional(),
        kind: z.enum(COMMENT_KINDS).optional(),
        path: z.string().min(1).max(1000).optional(),
        start: z.number().int().min(1).optional(),
        end: z.number().int().min(1).optional(),
        body: z.string().trim().min(1).max(20_000),
        send: z.boolean().optional(),
      }),
    )
    .output(commentSchema),
  send: oc
    .route({ method: "POST", path: `${base}/comments/{comment}/send` })
    .input(byComment)
    .output(commentSchema),
  resolve: oc
    .route({ method: "PUT", path: `${base}/comments/{comment}/resolution` })
    .input(byComment.extend({ resolved: z.boolean() }))
    .output(commentSchema),
  delete: oc
    .route({ method: "DELETE", path: `${base}/comments/{comment}` })
    .input(byComment)
    .output(okSchema),
};

// What an agent sends: a transcript for its session, naming the commit it
// led to or left for a commit's trailer to name.
export const transcriptsContract = {
  upload: oc
    .route({ method: "POST", path: "/api/sessions/{id}/transcripts" })
    .input(
      z.object({
        id: z.string(),
        commit: sha.optional(),
        entries: z
          .array(transcriptEntrySchema)
          .min(1)
          .max(MAX_TRANSCRIPT_ENTRIES),
      }),
    )
    .output(transcriptSummarySchema),
};
