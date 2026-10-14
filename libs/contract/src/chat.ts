import { oc } from "@orpc/contract";
import { z } from "zod";

// review.ts imports this file for its endpoints, so its okSchema is not ready
// here yet.
const ok = z.object({ ok: z.literal(true) });

// Mirrors CHAT_PAGES in @lib/db-models, which stores them. "groups" is the
// Brackets tab; the stored value keeps its old name.
export const CHAT_PAGES = ["overview", "groups", "files", "activity"] as const;
export type ChatPage = (typeof CHAT_PAGES)[number];

// The ad hoc channel: questions the server answers, for anyone reading a pull
// request while the server processes pull requests. It stands in for a
// channel id, and answers as AD_HOC_NAME.
export const AD_HOC_CHANNEL = "ad-hoc";
export const AD_HOC_NAME = "Ad hoc";

// How often a polling agent asks for messages.
export const CHAT_POLL_SECONDS = 25;

// An agent is live while it polled, replied or held its socket open this
// recently.
export const CHAT_LIVE_MS = 60_000;

// How long an agent shows as working on a message without answering it.
export const CHAT_WORKING_MS = 5 * 60_000;

// The most text a person's selection on the page sends along; the client
// cuts it to this.
export const MAX_CHAT_SELECTED_TEXT = 10_000;

// What a person was looking at when they wrote: a tab of the pull request,
// the file, the lines on it or the bracket (`group`), and any text they had selected.
export const chatContextSchema = z
  .object({
    page: z.enum(CHAT_PAGES),
    path: z.string().min(1).max(1000).optional(),
    start: z.number().int().min(1).optional(),
    end: z.number().int().min(1).optional(),
    group: z.string().max(200).optional(),
    selectedText: z.string().max(MAX_CHAT_SELECTED_TEXT).optional(),
  })
  .refine(
    (c) =>
      (c.start === undefined) === (c.end === undefined) &&
      (c.start === undefined || (c.path !== undefined && c.start <= c.end!)),
    "Lines need a path, and start and end with start <= end",
  );
export type ChatContext = z.infer<typeof chatContextSchema>;

// Where an agent listens: poll or reply at messagesUrl, or hold socketUrl
// open; DELETE url to stop. The key in them is the only credential, so they
// are as secret as an API key.
export const chatEndpointsSchema = z.object({
  url: z.string(),
  messagesUrl: z.string(),
  socketUrl: z.string(),
});
export type ChatEndpoints = z.infer<typeof chatEndpointsSchema>;

const person = z.object({ id: z.string(), name: z.string() });

// A person's message as its agent gets it.
export const agentChatMessageSchema = z.object({
  id: z.string(),
  from: person,
  body: z.string(),
  context: chatContextSchema.nullable(),
  sentAt: z.number(),
});
export type AgentChatMessage = z.infer<typeof agentChatMessageSchema>;

export const chatPollSchema = z.object({
  pullRequest: z.object({
    id: z.string(),
    number: z.number(),
    repository: z.string(),
    title: z.string(),
  }),
  messages: z.array(agentChatMessageSchema),
});
export type ChatPoll = z.infer<typeof chatPollSchema>;

// One of your agents listening on a pull request, as you pick who to talk
// to.
export const chatAgentSchema = z.object({
  channel: z.string(),
  agent: z.object({ id: z.string(), name: z.string() }),
  // The agent opened this pull request.
  madeThis: z.boolean(),
  // The server answers here, not an agent: the AD_HOC_CHANNEL.
  adHoc: z.boolean(),
  live: z.boolean(),
  lastSeenAt: z.number().nullable(),
});
export type ChatAgent = z.infer<typeof chatAgentSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["person", "agent"]),
  // The person's or the agent's name.
  author: z.string(),
  body: z.string(),
  context: chatContextSchema.nullable(),
  // Whether the agent got a person's message yet; always true for its own.
  delivered: z.boolean(),
  // When the agent said it was working on a person's message; null until then.
  workingAt: z.number().nullable(),
  createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

const byPullRequest = z.object({
  name: z.string(),
  number: z.coerce.number<number>().int().min(1),
});
const byChannel = byPullRequest.extend({ channel: z.string() });

const base = "/api/repositories/{name}/pull-requests/{number}/chat";

// People talk to their own agents listening on a pull request, one
// conversation per agent.
export const chatContract = {
  agents: oc
    .route({ method: "GET", path: base })
    .input(byPullRequest)
    .output(z.array(chatAgentSchema)),
  messages: oc
    .route({ method: "GET", path: `${base}/{channel}` })
    .input(byChannel)
    .output(z.array(chatMessageSchema)),
  send: oc
    .route({ method: "POST", path: `${base}/{channel}` })
    .input(
      byChannel.extend({
        body: z.string().trim().min(1).max(20_000),
        context: chatContextSchema.optional(),
      }),
    )
    .output(chatMessageSchema),
  // Takes back a message the agent has not had yet.
  deleteMessage: oc
    .route({ method: "DELETE", path: `${base}/{channel}/messages/{message}` })
    .input(byChannel.extend({ message: z.string() }))
    .output(ok),
};

const byKey = z.object({ key: z.string().min(1).max(200) });

// What a listening agent calls. The key in the path authenticates it: no
// API key, so a background loop holds nothing else.
export const agentChatContract = {
  // Starts listening on a pull request, or replaces this agent's key on it.
  listen: oc
    .route({ method: "POST", path: "/api/pull-requests/{id}/chat" })
    .input(z.object({ id: z.string() }))
    .output(chatEndpointsSchema),
  // Messages the agent has not had yet, marked delivered as they are
  // returned. It answers at once; the agent asks again every
  // CHAT_POLL_SECONDS.
  poll: oc
    .route({ method: "GET", path: "/api/chat/{key}/messages" })
    .input(byKey)
    .output(chatPollSchema),
  // A reply to the person who wrote `replyTo`, or else to the last person
  // who wrote.
  reply: oc
    .route({ method: "POST", path: "/api/chat/{key}/messages" })
    .input(
      byKey.extend({
        body: z.string().trim().min(1).max(50_000),
        replyTo: z.string().optional(),
      }),
    )
    .output(chatMessageSchema),
  // Tells the person who wrote `replyTo`, or else the last who wrote, that the
  // agent is working on an answer.
  working: oc
    .route({ method: "POST", path: "/api/chat/{key}/working" })
    .input(byKey.extend({ replyTo: z.string().optional() }))
    .output(ok),
  close: oc
    .route({ method: "DELETE", path: "/api/chat/{key}" })
    .input(byKey)
    .output(ok),
};
