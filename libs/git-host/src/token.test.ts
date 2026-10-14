import { expect, it } from "vitest";
import { tokenExpiry } from "./token";

it("reads the expiry a repository token carries", () => {
  expect(tokenExpiry(`art_v1_${"a".repeat(40)}?expires=1791700000`)).toBe(
    new Date(1791700000 * 1000).toISOString(),
  );
});

it("assumes the default lifetime when a token carries none", () => {
  expect(tokenExpiry(`art_v1_${"a".repeat(40)}`, 0)).toBe(
    new Date(24 * 60 * 60 * 1000).toISOString(),
  );
});
