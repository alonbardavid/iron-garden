import { describe, expect, it } from "vitest";
import { outcomeOf } from "./status";

describe("outcomeOf", () => {
  it("reads unfinished runs from their status", () => {
    expect(outcomeOf("in_progress", null).label).toBe("Running");
    expect(outcomeOf("queued", null).label).toBe("Queued");
    expect(outcomeOf("waiting", null).label).toBe("Queued");
  });

  it("reads finished runs from their conclusion", () => {
    expect(outcomeOf("completed", "success").label).toBe("Passed");
    expect(outcomeOf("completed", "timed_out").label).toBe("Failed");
    expect(outcomeOf("completed", "action_required")).toEqual({
      label: "action_required",
      color: "orange",
    });
  });
});
