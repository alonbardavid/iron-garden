import { describe, expect, it } from "vitest";
import { exclusiveCollisions, type ExclusiveRule } from "./exclusive";

const IMAGES: ExclusiveRule = {
  id: "RULE_images",
  name: "Images",
  syntax: "glob",
  patterns: ["**/*.png"],
};

describe("exclusive collisions", () => {
  it("finds another session holding a path a rule marks exclusive", () => {
    const found = exclusiveCollisions(
      ["assets/logo.png", "src/a.ts"],
      [IMAGES],
      [
        {
          sessionId: "A",
          path: "assets/logo.png",
          source: "declared",
          branch: "",
        },
        { sessionId: "A", path: "src/a.ts", source: "declared", branch: "" },
      ],
    );
    expect(found).toEqual([
      {
        path: "assets/logo.png",
        rule: { id: "RULE_images", name: "Images" },
        holder: {
          sessionId: "A",
          path: "assets/logo.png",
          source: "declared",
          branch: "",
        },
      },
    ]);
  });

  it("is nothing when no rule marks the path, or nobody else holds it", () => {
    expect(
      exclusiveCollisions(
        ["src/a.ts"],
        [IMAGES],
        [{ sessionId: "A", path: "src/a.ts", source: "declared", branch: "" }],
      ),
    ).toEqual([]);
    expect(exclusiveCollisions(["logo.png"], [IMAGES], [])).toEqual([]);
  });

  it("names each holding session once, by its commit if it has one", () => {
    const found = exclusiveCollisions(
      ["logo.png"],
      [IMAGES],
      [
        { sessionId: "A", path: "logo.png", source: "declared", branch: "" },
        {
          sessionId: "A",
          path: "logo.png",
          source: "committed",
          branch: "header",
        },
        { sessionId: "B", path: "logo.png", source: "declared", branch: "" },
      ],
    );
    expect(found.map((c) => [c.holder.sessionId, c.holder.source])).toEqual([
      ["A", "committed"],
      ["B", "declared"],
    ]);
  });
});
