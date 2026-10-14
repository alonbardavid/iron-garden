import { describe, expect, it } from "vitest";
import {
  decrypt,
  deriveKey,
  encrypt,
  randomSecret,
  verifySignature,
} from "./crypto";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("secret encryption", () => {
  it("opens what it sealed, and nothing sealed under another secret", async () => {
    const key = await deriveKey("instance-secret");
    const sealed = await encrypt(key, "ghp_example");
    expect(sealed).not.toContain("ghp_example");
    expect(await decrypt(key, sealed)).toBe("ghp_example");
    expect(await decrypt(await deriveKey("rotated"), sealed)).toBeNull();
    expect(await decrypt(key, "garbage")).toBeNull();
  });

  it("never seals the same value the same way twice", async () => {
    const key = await deriveKey("instance-secret");
    expect(await encrypt(key, "same")).not.toBe(await encrypt(key, "same"));
  });

  it("generates 256-bit hex webhook secrets", () => {
    expect(randomSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(randomSecret()).not.toBe(randomSecret());
  });
});

describe("verifySignature", () => {
  // GitHub's own example from "Validating webhook deliveries".
  const secret = "It's a Secret to Everybody";
  const body = bytes("Hello, World!");
  const signature =
    "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";

  it("accepts GitHub's signature", async () => {
    expect(await verifySignature(secret, body, signature)).toBe(true);
  });

  it("rejects another body, another secret, or no signature", async () => {
    expect(await verifySignature(secret, bytes("Hello"), signature)).toBe(
      false,
    );
    expect(await verifySignature("other", body, signature)).toBe(false);
    expect(await verifySignature(secret, body, null)).toBe(false);
    expect(await verifySignature(secret, body, "sha1=abc")).toBe(false);
  });
});
