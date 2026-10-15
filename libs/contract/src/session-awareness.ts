import { oc } from "@orpc/contract";
import { z } from "zod";

// Mirrors CONTACT_KINDS in @lib/db-models.
export const CONTACT_KINDS = ["https", "a2a", "mcp", "email", "other"] as const;

const URL_KINDS: ReadonlySet<string> = new Set(["https", "a2a", "mcp"]);

// How a session may be reached outside the platform. Everyone who can read
// the repository sees it, so it must carry no secret; the platform never
// calls it.
export const contactSchema = z
  .array(
    z
      .object({
        kind: z.enum(CONTACT_KINDS),
        value: z.string().trim().min(1).max(500),
        note: z.string().trim().max(300).optional(),
      })
      .refine(
        (entry) =>
          !URL_KINDS.has(entry.kind) || /^https:\/\/\S+$/.test(entry.value),
        { message: "A URL contact must be an https URL", path: ["value"] },
      ),
  )
  .max(5);
export type Contact = z.infer<typeof contactSchema>;

// Mirrors NOTIFICATION_KINDS in @lib/db-models.
export const NOTIFICATION_KINDS = [
  "collision",
  "message",
  "undelivered",
  "chat",
] as const;

export const sessionNotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  fromSessionId: z.string().nullable(),
  replyTo: z.string().nullable(),
  createdAt: z.number(),
});
export type SessionNotificationItem = z.infer<typeof sessionNotificationSchema>;

const notifications = z.object({
  notifications: z.array(sessionNotificationSchema),
});

// Where a session's listener connects; the key in them is their only
// credential.
export const listenEndpointsSchema = z.object({
  pollUrl: z.string(),
  socketUrl: z.string(),
});

// Mirrors MAX_REPORTED_PATHS in @lib/collab.
const reportedPaths = z.array(z.string().min(1).max(1000)).max(200).default([]);

export const MAX_MESSAGE_LENGTH = 8_000;

const bySession = z.object({ id: z.string() });

export const sessionAwarenessContract = {
  // The files the session is changing now, and the ones it stopped changing;
  // answers with what the session has not been told yet.
  activity: oc
    .route({ method: "POST", path: "/api/sessions/{id}/activity" })
    .input(bySession.extend({ editing: reportedPaths, done: reportedPaths }))
    .output(notifications.extend({ refused: z.array(z.string()) })),
  notifications: oc
    .route({ method: "GET", path: "/api/sessions/{id}/notifications" })
    .input(bySession)
    .output(notifications),
  // A fresh key for the session's listener; the old one stops working.
  listen: oc
    .route({ method: "POST", path: "/api/sessions/{id}/listen" })
    .input(bySession)
    .output(listenEndpointsSchema),
  sendMessage: oc
    .route({ method: "POST", path: "/api/sessions/{id}/messages" })
    .input(
      bySession.extend({
        to: z.string().min(1),
        body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
        replyTo: z.string().nullable().optional(),
      }),
    )
    .output(z.object({ id: z.string(), recipientLive: z.boolean() })),
};

// A message in the chat between a session's agent and the person it works
// for. A person's is delivered once the agent fetched its `chat` notice.
export const sessionChatMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["person", "agent"]),
  author: z.string(),
  body: z.string(),
  delivered: z.boolean(),
  createdAt: z.number(),
});
export type SessionChatMessage = z.infer<typeof sessionChatMessageSchema>;

const chatBody = z.string().trim().min(1).max(MAX_MESSAGE_LENGTH);

// The agent's side of its session's chat; the person's messages reach it as
// `chat` notices.
export const sessionChatContract = {
  reply: oc
    .route({ method: "POST", path: "/api/sessions/{id}/chat" })
    .input(bySession.extend({ body: chatBody }))
    .output(sessionChatMessageSchema),
};

// The person's side, on the session's page; only the person its agent works
// for reads or writes it.
export const repositorySessionChatContract = {
  messages: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/sessions/{id}/chat",
    })
    .input(z.object({ name: z.string(), id: z.string() }))
    .output(z.array(sessionChatMessageSchema)),
  send: oc
    .route({
      method: "POST",
      path: "/api/repositories/{name}/sessions/{id}/chat",
    })
    .input(z.object({ name: z.string(), id: z.string(), body: chatBody }))
    .output(sessionChatMessageSchema),
};

// A listening session, authenticated by the key in the path.
export const sessionInboxContract = {
  poll: oc
    .route({ method: "GET", path: "/api/session-inbox/{key}/notifications" })
    .input(z.object({ key: z.string() }))
    .output(notifications),
};
