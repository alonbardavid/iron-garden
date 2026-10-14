import { describe, expect, it } from "vitest";
import { parseRefAdvertisement } from "./refs";

function pkt(payload: string): string {
  const length = new TextEncoder().encode(payload).length + 4;
  return length.toString(16).padStart(4, "0") + payload;
}

const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);

describe("parseRefAdvertisement", () => {
  it("lists branches by name and finds the one HEAD points at", () => {
    const body = [
      pkt("# service=git-upload-pack\n"),
      "0000",
      pkt(`${a} HEAD\0multi_ack symref=HEAD:refs/heads/main agent=git/2\n`),
      pkt(`${b} refs/heads/feature/ünïcode\n`),
      pkt(`${a} refs/heads/main\n`),
      pkt(`${c} refs/tags/v1\n`),
      "0000",
    ].join("");
    expect(parseRefAdvertisement(new TextEncoder().encode(body))).toEqual({
      head: "main",
      branches: [
        { name: "feature/ünïcode", commit: b },
        { name: "main", commit: a },
      ],
    });
  });

  it("reads an empty repository's advertisement as no branches", () => {
    const body = [
      pkt("# service=git-upload-pack\n"),
      "0000",
      pkt(`${"0".repeat(40)} capabilities^{}\0agent=git/2\n`),
      "0000",
    ].join("");
    expect(parseRefAdvertisement(new TextEncoder().encode(body))).toEqual({
      head: null,
      branches: [],
    });
  });
});
