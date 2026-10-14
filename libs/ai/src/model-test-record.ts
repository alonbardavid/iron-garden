import { DEFAULT_GATEWAY } from "./defaults";

export interface ModelTest {
  ok: boolean;
  model: string;
  // The gateway the call went through.
  gateway: string;
  ms: number;
  // What went wrong, when it did.
  error: string | null;
  testedAt: number;
}

/**
 * A stored model test, or null when it cannot be read as one. A test kept
 * before calls always went through a gateway has none, and went through
 * none: it is shown as the default's.
 */
export function readModelTest(value: string): ModelTest | null {
  let stored: Partial<Record<keyof ModelTest, unknown>>;
  try {
    stored = JSON.parse(value) as typeof stored;
  } catch {
    return null;
  }
  const { ok, model, gateway, ms, error, testedAt } = stored ?? {};
  if (
    typeof ok !== "boolean" ||
    typeof model !== "string" ||
    typeof ms !== "number" ||
    typeof testedAt !== "number"
  ) {
    return null;
  }
  return {
    ok,
    model,
    gateway: typeof gateway === "string" ? gateway : DEFAULT_GATEWAY,
    ms,
    error: typeof error === "string" ? error : null,
    testedAt,
  };
}
