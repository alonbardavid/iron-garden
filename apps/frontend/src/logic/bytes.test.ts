import { describe, expect, it } from "vitest";
import { formatBytes, formatBytesChange } from "./bytes";

describe("formatBytes", () => {
  it("names sizes in the unit that reads best", () => {
    expect(formatBytes(235)).toBe("235 B");
    expect(formatBytes(12_700)).toBe("12.4 KB");
    expect(formatBytes(1_468_006)).toBe("1.4 MB");
  });

  it("signs a change in size", () => {
    expect(formatBytesChange(1229)).toBe("+1.2 KB");
    expect(formatBytesChange(-40)).toBe("−40 B");
    expect(formatBytesChange(0)).toBe("±0 B");
  });
});
