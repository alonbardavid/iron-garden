import { describe, expect, it } from "vitest";
import type { AccessLevel } from "@lib/db-models";
import { allows, effectiveLevel, type Grantee } from "./access";

const ACCESS_LEVELS: AccessLevel[] = ["read", "write", "admin"];
const LEVELS: (AccessLevel | null)[] = [null, ...ACCESS_LEVELS];
const RANK = { read: 1, write: 2, admin: 3 } as const;
const rank = (level: AccessLevel | null) => (level ? RANK[level] : 0);

describe("allows", () => {
  it.each(
    LEVELS.flatMap((level) =>
      ACCESS_LEVELS.map((action) => [level, action] as const),
    ),
  )("level %s may %s only when at least that level", (level, action) => {
    expect(allows(level, action)).toBe(rank(level) >= RANK[action]);
  });
});

describe("effectiveLevel", () => {
  const user: Grantee = { kind: "user", role: "user" };
  const admin: Grantee = { kind: "user", role: "admin" };
  const agent: Grantee = { kind: "agent", role: "user" };
  const adminsAgent: Grantee = { kind: "agent", role: "admin" };

  it("gives a user their membership and nothing without one", () => {
    for (const member of LEVELS) {
      expect(effectiveLevel(user, member, null)).toBe(member);
    }
  });

  it("gives an instance admin Admin on every repository", () => {
    for (const member of LEVELS) {
      expect(effectiveLevel(admin, member, null)).toBe("admin");
    }
  });

  it("caps an agent at the lower of its grant and its owner's level", () => {
    for (const member of LEVELS) {
      for (const grant of LEVELS) {
        const expected =
          member && grant
            ? rank(member) <= rank(grant)
              ? member
              : grant
            : null;
        expect(effectiveLevel(agent, member, grant)).toBe(expected);
      }
    }
  });

  it("gives an admin's agent only what it was granted", () => {
    for (const grant of LEVELS) {
      expect(effectiveLevel(adminsAgent, null, grant)).toBe(grant);
    }
  });
});
