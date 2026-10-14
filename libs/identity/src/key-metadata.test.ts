import { describe, expect, it } from "vitest";
import { parseKeyMetadata } from "./key-metadata";

describe("parseKeyMetadata", () => {
  it("reads personal and agent keys, stored as objects or JSON", () => {
    expect(parseKeyMetadata({ kind: "user" })).toEqual({ kind: "user" });
    expect(parseKeyMetadata('{"kind":"agent","agentId":"AGT_1"}')).toEqual({
      kind: "agent",
      agentId: "AGT_1",
    });
    expect(
      parseKeyMetadata(JSON.stringify(JSON.stringify({ kind: "user" }))),
    ).toEqual({ kind: "user" });
  });

  it("refuses anything else, so an unmarked key acts for no one", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "not json",
      {},
      { kind: "agent" },
      { kind: "agent", agentId: "" },
      { kind: "admin" },
    ]) {
      expect(parseKeyMetadata(raw)).toBeNull();
    }
  });
});
