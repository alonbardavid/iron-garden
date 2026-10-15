import { oc } from "@orpc/contract";
import { z } from "zod";
import { transcriptSchema, transcriptSummarySchema } from "./activity";
import { PULL_REQUEST_STATUSES } from "./review";
import {
  contactSchema,
  repositorySessionChatContract,
  sessionNotificationSchema,
} from "./session-awareness";

// A session is live while its agent called the API for it, or listened for
// chat on its pull request, this recently; active but quieter is idle.
export const SESSION_LIVE_MS = 15 * 60_000;

export const sessionPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  status: z.enum(PULL_REQUEST_STATUSES),
  branch: z.string(),
});

// A session as anyone who can read its repository sees it.
export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  goal: z.string().nullable(),
  client: z.string().nullable(),
  status: z.enum(["active", "ended"]),
  live: z.boolean(),
  lastSeenAt: z.number().nullable(),
  agent: z.object({ name: z.string(), ownerName: z.string().nullable() }),
  baseBranch: z.string(),
  pullRequests: z.array(sessionPullRequestSchema),
  // Whether it has work waiting to merge: a pull request processing or
  // open, or a pushed branch with none.
  unmerged: z.boolean(),
  // Files in its working set, and its open collisions either way.
  fileCount: z.number(),
  collisionCount: z.number(),
  createdAt: z.number(),
  endedAt: z.number().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionCollisionSchema = z.object({
  id: z.string(),
  path: z.string(),
  rule: z.string().nullable(),
  // Whether this session caused it (and was told), or the other one did.
  caused: z.boolean(),
  other: z.object({
    id: z.string(),
    title: z.string().nullable(),
    agent: z.string(),
  }),
  createdAt: z.number(),
});

export const sessionOverviewSchema = sessionSummarySchema.extend({
  context: z.string().nullable(),
  baseCommit: z.string().nullable(),
  workingSet: z.object({
    // Files its agent said it is changing.
    editing: z.array(z.string()),
    // Files its pushed branches change, by branch.
    committed: z.array(
      z.object({ branch: z.string(), paths: z.array(z.string()) }),
    ),
    // Which of them a mark-exclusive rule marks.
    exclusive: z.array(z.string()),
  }),
  // Pushed branches with no pull request processing or open.
  unmergedBranches: z.array(z.string()),
  collisions: z.array(sessionCollisionSchema),
  // Null while an admin has messaging between sessions turned off.
  contact: contactSchema.nullable(),
  // Only for the people who own the session's agent.
  messages: z.array(sessionNotificationSchema).nullable(),
  // Newest first, whether or not a commit names them yet.
  transcripts: z.array(transcriptSummarySchema),
  // Whether the viewer is the person its agent works for, who chats with it.
  canChat: z.boolean(),
  canDismiss: z.boolean(),
});
export type SessionOverview = z.infer<typeof sessionOverviewSchema>;

const byRepository = z.object({ name: z.string() });

export const repositorySessionsContract = {
  list: oc
    .route({ method: "GET", path: "/api/repositories/{name}/sessions" })
    .input(byRepository)
    .output(z.array(sessionSummarySchema)),
  get: oc
    .route({ method: "GET", path: "/api/repositories/{name}/sessions/{id}" })
    .input(byRepository.extend({ id: z.string() }))
    .output(sessionOverviewSchema),
  transcript: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/sessions/{id}/transcripts/{transcript}",
    })
    .input(byRepository.extend({ id: z.string(), transcript: z.string() }))
    .output(transcriptSchema),
  chat: repositorySessionChatContract,
  // Clears an ended session's branches that never got a pull request.
  dismiss: oc
    .route({
      method: "POST",
      path: "/api/repositories/{name}/sessions/{id}/dismiss",
    })
    .input(byRepository.extend({ id: z.string() }))
    .output(z.object({ ok: z.literal(true) })),
};
