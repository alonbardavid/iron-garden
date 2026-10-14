import { describe, expect, it } from "vitest";
import type { ChatAgent, ChatMessage } from "@lib/contract";
import {
  agentWorking,
  contextLabel,
  defaultAgent,
  deliveryOf,
  initials,
  parseLinesRef,
} from "./model";

const agent = (over: Partial<ChatAgent>): ChatAgent => ({
  channel: "CHC_x",
  agent: { id: "AGT_x", name: "x" },
  madeThis: false,
  adHoc: false,
  live: false,
  lastSeenAt: null,
  ...over,
});

describe("contextLabel", () => {
  it("names the tab, the file and the lines", () => {
    expect(
      contextLabel({
        page: "files",
        path: "api/src/routes/invoices.ts",
        start: 14,
        end: 21,
      }),
    ).toBe("Files · routes/invoices.ts · lines 14–21");
    expect(contextLabel({ page: "overview" })).toBe("Overview");
  });

  it("names a bracket by its title", () => {
    expect(
      contextLabel({ page: "groups", group: "PRG_1" }, () => "Usage flow"),
    ).toBe("Brackets · Usage flow");
  });
});

describe("parseLinesRef", () => {
  it("reads a path and a range or one line", () => {
    expect(parseLinesRef("src/a.ts:16-24\n")).toEqual({
      path: "src/a.ts",
      start: 16,
      end: 24,
    });
    expect(parseLinesRef("src/a b.ts:7")).toEqual({
      path: "src/a b.ts",
      start: 7,
      end: 7,
    });
  });

  it("refuses anything else", () => {
    expect(parseLinesRef("src/a.ts")).toBeNull();
    expect(parseLinesRef("src/a.ts:9-3")).toBeNull();
    expect(parseLinesRef("src/a.ts:0")).toBeNull();
  });
});

describe("defaultAgent", () => {
  const made = agent({ channel: "made", madeThis: true });
  const live = agent({ channel: "live", live: true });

  it("prefers a live agent, then the one that made the change", () => {
    expect(defaultAgent([made, live])).toBe(live);
    expect(defaultAgent([live, { ...made, live: true }])).toBe(live);
    expect(defaultAgent([agent({}), made])).toBe(made);
    expect(defaultAgent([])).toBeUndefined();
  });

  it("talks to ad hoc only when no agent of yours listens", () => {
    const adHoc = agent({ channel: "ad-hoc", adHoc: true, live: true });
    expect(defaultAgent([made, adHoc])).toBe(made);
    expect(defaultAgent([adHoc])).toBe(adHoc);
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("maya-claude")).toBe("MC");
    expect(initials("lena")).toBe("LE");
  });
});

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "CHM_x",
  sender: "person",
  author: "Test User",
  body: "?",
  context: null,
  delivered: true,
  workingAt: null,
  createdAt: 0,
  ...over,
});

describe("agentWorking", () => {
  const now = 10 * 60_000;

  it("holds until the agent answers or five minutes pass", () => {
    const asked = message({ workingAt: now - 60_000 });
    expect(agentWorking([asked], now)).toBe(true);
    expect(agentWorking([asked, message({ sender: "agent" })], now)).toBe(
      false,
    );
    expect(agentWorking([message({ workingAt: now - 6 * 60_000 })], now)).toBe(
      false,
    );
    expect(agentWorking([message({})], now)).toBe(false);
  });
});

describe("deliveryOf", () => {
  it("is received once delivered, else sending while the agent is live", () => {
    expect(deliveryOf(message({}), false)).toBe("received");
    const pending = message({ delivered: false });
    expect(deliveryOf(pending, true)).toBe("sending");
    expect(deliveryOf(pending, false)).toBe("waiting");
    expect(deliveryOf({ ...pending, sending: true }, false)).toBe("sending");
  });
});
