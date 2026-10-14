import {
  CHAT_WORKING_MS,
  type ChatAgent,
  type ChatContext,
  type ChatMessage,
} from "@lib/contract";

// What the chat says it gets, and what a message was about: "Files ·
// routes/invoices.ts · lines 14–21".
export function contextLabel(
  context: ChatContext,
  groupTitle?: (id: string) => string | undefined,
): string {
  const parts: string[] = [PAGE_LABELS[context.page]];
  if (context.group) {
    parts.push(groupTitle?.(context.group) ?? "a bracket");
  }
  if (context.path) {
    parts.push(shortPath(context.path));
  }
  if (context.start !== undefined && context.end !== undefined) {
    parts.push(linesText(context.start, context.end));
  }
  return parts.join(" · ");
}

const PAGE_LABELS: Record<ChatContext["page"], string> = {
  overview: "Overview",
  groups: "Brackets",
  files: "Files",
  activity: "Activity",
};

// The file and its folder, enough to tell most files apart.
export function shortPath(path: string): string {
  return path.split("/").slice(-2).join("/");
}

export function linesText(start: number, end: number): string {
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
}

export interface LinesRef {
  path: string;
  start: number;
  end: number;
}

// An agent shows lines of the change with a ```lines block holding
// "<path>:<start>-<end>" (or "<path>:<line>").
export function parseLinesRef(text: string): LinesRef | null {
  const match = /^\s*(\S(?:.*\S)?):(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(text);
  if (!match) {
    return null;
  }
  const start = Number(match[2]);
  const end = match[3] === undefined ? start : Number(match[3]);
  return start >= 1 && end >= start ? { path: match[1]!, start, end } : null;
}

// Which of your agents to talk to unless you picked: a live one, else the
// one that made the change, else whichever listens first; ad hoc when none
// of yours listens.
export function defaultAgent(all: ChatAgent[]): ChatAgent | undefined {
  const agents = all.filter((a) => !a.adHoc);
  return (
    agents.find((a) => a.live) ??
    agents.find((a) => a.madeThis) ??
    agents[0] ??
    all.find((a) => a.adHoc)
  );
}

// "maya-claude" → "MC".
export function initials(name: string): string {
  const words = name.split(/[\s_.-]+/).filter(Boolean);
  return (
    words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)
  ).toUpperCase();
}

// Whether the agent said it is working on a message it has not answered yet,
// and said so recently enough to still be at it.
export function agentWorking(messages: ChatMessage[], now: number): boolean {
  const answered = messages.map((m) => m.sender).lastIndexOf("agent");
  return messages
    .slice(answered + 1)
    .some((m) => m.workingAt !== null && now - m.workingAt < CHAT_WORKING_MS);
}

// What a message's ticker shows: still on its way, waiting for the agent to
// reconnect, or received.
export type Delivery = "sending" | "waiting" | "received";

export function deliveryOf(
  message: ChatMessage & { sending?: boolean },
  agentLive: boolean,
): Delivery {
  if (message.delivered) {
    return "received";
  }
  return message.sending || agentLive ? "sending" : "waiting";
}
