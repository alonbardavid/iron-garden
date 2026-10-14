import { env } from "cloudflare:workers";
import { MIN_SETUP_TOKEN_LENGTH } from "@lib/contract";
import { getDb, user, eq } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import { getAuth } from "./auth";
import { passwordSet } from "./users";

const log = moduleLogger("identity/setup");

export type SetupState = "open" | "closed" | "unconfigured";

export interface FirstAdmin {
  token: string;
  username: string;
  name: string;
  email: string;
  password: string;
}

export class SetupError extends Error {
  constructor(
    readonly reason: "closed" | "unconfigured" | "bad_token",
    message: string,
  ) {
    super(message);
    this.name = "SetupError";
  }
}

// Setup is open exactly while the instance has no admin.
export async function setupState(): Promise<SetupState> {
  const [admin] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  if (admin) {
    return "closed";
  }
  return setupToken() ? "open" : "unconfigured";
}

export async function createFirstAdmin(input: FirstAdmin): Promise<void> {
  const state = await setupState();
  if (state === "closed") {
    throw new SetupError("closed", "This instance already has an admin");
  }
  const expected = setupToken();
  if (!expected) {
    throw new SetupError(
      "unconfigured",
      `Set the SETUP_TOKEN secret (at least ${MIN_SETUP_TOKEN_LENGTH} characters) to create the first admin`,
    );
  }
  if (!(await sameSecret(input.token, expected))) {
    log.warning("setup refused a wrong token");
    throw new SetupError("bad_token", "The setup token is not correct");
  }
  const { user: created } = await getAuth().api.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: "admin",
      data: { username: input.username },
    },
  });
  await passwordSet(created.id, false);
  log.info("first admin created", { userId: created.id });
}

function setupToken(): string | null {
  const { SETUP_TOKEN } = env as { SETUP_TOKEN?: string };
  return SETUP_TOKEN && SETUP_TOKEN.length >= MIN_SETUP_TOKEN_LENGTH
    ? SETUP_TOKEN
    : null;
}

// Compares digests, so neither the length nor the content of the expected
// token leaks through timing.
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [given, expected].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  const left = new Uint8Array(a!);
  const right = new Uint8Array(b!);
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference |= left[i]! ^ right[i]!;
  }
  return difference === 0;
}
