import { env } from "cloudflare:workers";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { apiKey } from "@better-auth/api-key";
import { getDb, authSchema, newEntityId, type Entity } from "@lib/db-models";
import { sendEmail } from "@lib/email-service";
import { renderEmail, type EmailTemplate } from "@lib/email-ds";
import {
  PRODUCT_DISPLAY_NAME,
  isValidName,
  NAME_RULE,
  MIN_PASSWORD_LENGTH,
} from "@lib/contract";
import { getCapabilities } from "@lib/capabilities";
import { moduleLogger } from "@lib/logging";
import { invite, resetPassword, verifyEmail } from "./emails";
import { isInvited, passwordSet } from "./users";
import { assertNotLastAdmin } from "./admins";

const log = moduleLogger("identity/auth");

type AuthEnv = {
  BETTER_AUTH_SECRET: string;
  FRONTEND_CANONICAL_BASE_URL: string;
  AUTH_ALLOWED_HOSTS?: string;
};

export const PERSONAL_KEY_PREFIX = "cgit_pat_";
export const AGENT_KEY_PREFIX = "cgit_agt_";

// Key metadata decides who a key acts for, so keys are only ever created, listed
// and revoked through the app's own API (see ./keys). Impersonation is not part
// of the product.
const BLOCKED_CLIENT_PATHS = ["/api-key/", "/admin/impersonate-user"];

// The slice of the better-auth instance the app calls. Spelled out because the
// inferred type is too large to emit in a declaration file; `getAuth` still
// checks the real instance against it.
export interface AppAuth {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(args: { headers: Headers }): Promise<{
      user: {
        id: string;
        role?: string | null;
        banned?: boolean | null;
        mustChangePassword?: boolean | null;
      };
      session: { id: string };
    } | null>;
    verifyApiKey(args: { body: { key: string } }): Promise<{
      valid: boolean;
      key: { id: string; referenceId: string; metadata?: unknown } | null;
    }>;
    createApiKey(args: {
      body: {
        userId: string;
        name: string;
        prefix: string;
        expiresIn: number | null;
        metadata: Record<string, unknown>;
      };
    }): Promise<{
      id: string;
      key: string;
      name: string | null;
      start: string | null;
      createdAt: Date;
      expiresAt: Date | null;
    }>;
    createUser(args: {
      body: {
        email: string;
        password?: string;
        name: string;
        role: "admin" | "user";
        data: Record<string, unknown>;
      };
    }): Promise<{ user: { id: string } }>;
  };
}

let cached: AppAuth | null = null;

// The origin a request arrived on wins over the configured one, so a single
// deployed version can serve its preview URL and any promoted/custom domain.
// Only allowlisted hosts are honoured; an unknown host falls back to the
// canonical frontend URL.
function allowedHosts(baseUrl: string, configured?: string): string[] {
  const extra = (configured ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return [...new Set([new URL(baseUrl).host, ...extra])];
}

const AUTH_MODEL_ENTITIES: Record<string, Entity> = {
  user: "USER",
  session: "USER_SESSION",
  account: "USER_ACCOUNT",
  verification: "USER_VERIFICATION",
  apikey: "API_KEY",
};

function generateAuthId({ model }: { model: string }): string {
  const entity = AUTH_MODEL_ENTITIES[model];
  if (!entity) {
    throw new Error(`No entity id prefix for better-auth model "${model}"`);
  }
  return newEntityId(entity);
}

// Sign-up is closed: admins create users. Email adds invites and password
// resets.
// An admin can turn email on or off at runtime, so the senders are always
// configured and beforeHook refuses EMAIL_PATHS while email is off.
function emailOptions(): Pick<
  BetterAuthOptions,
  "emailAndPassword" | "emailVerification"
> {
  return {
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      sendResetPassword: ({ user, url }) =>
        sendTemplate(resetPassword, user, url),
      onPasswordReset: ({ user }) => passwordSet(user.id, false),
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        sendTemplate(verifyEmail, user, url),
    },
  };
}

const EMAIL_PATHS = [
  "/request-password-reset",
  "/send-verification-email",
  "/change-email",
];

async function sendTemplate(
  template: EmailTemplate<{ name: string; url: string }>,
  user: { name: string; email: string },
  url: string,
): Promise<void> {
  const { subject, html } = await renderEmail(template, {
    name: user.name,
    url,
  });
  await sendEmail({
    to: user.email,
    subject,
    html,
    fromName: PRODUCT_DISPLAY_NAME,
  });
}

const INVITE_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;

interface InviteContext {
  baseURL: string;
  internalAdapter: {
    createVerificationValue(data: {
      value: string;
      identifier: string;
      expiresAt: Date;
    }): Promise<unknown>;
  };
}

// An invite is a password-reset token that lasts longer, so better-auth's own
// reset endpoints redeem it and create the user's credential account.
async function sendInvite(
  context: InviteContext,
  user: { id: string; name: string; email: string },
): Promise<void> {
  const token = generateRandomString(32, "a-z", "A-Z", "0-9");
  await context.internalAdapter.createVerificationValue({
    value: user.id,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + INVITE_EXPIRES_IN_MS),
  });
  const callbackURL = encodeURIComponent("/reset-password?invite=1");
  try {
    await sendTemplate(
      invite,
      user,
      `${context.baseURL}/reset-password/${token}?callbackURL=${callbackURL}`,
    );
  } catch (error) {
    log.error("invite email failed", { userId: user.id, err: error });
    throw new APIError("BAD_GATEWAY", {
      code: "INVITE_NOT_SENT",
      message:
        "The user was created, but the invite email could not be sent. Reset their password to give them a temporary one.",
    });
  }
  log.info("invite sent", { userId: user.id });
}

// The user a /reset-password request redeems an invite for, from the before
// hook (which still sees the token) to the after hook (which signs them in).
const redeemingInvite = new WeakMap<Request, string>();

const beforeHook = createAuthMiddleware(async (ctx) => {
  if (ctx.request && BLOCKED_CLIENT_PATHS.some((p) => ctx.path.startsWith(p))) {
    throw new APIError("FORBIDDEN", { message: "Not available" });
  }
  if (EMAIL_PATHS.includes(ctx.path) && !(await getCapabilities()).email) {
    throw new APIError("NOT_FOUND", {
      message: "Email is not set up on this instance",
    });
  }
  switch (ctx.path) {
    case "/admin/create-user": {
      // Admin-created users need a username: it is their git login. Without a
      // password they are invited by email and choose their own; either way
      // they must set one before they get in.
      if (!ctx.body?.password && !(await getCapabilities()).email) {
        throw new APIError("BAD_REQUEST", {
          code: "PASSWORD_REQUIRED",
          message: "Email is not set up: give the user a temporary password",
        });
      }
      const data = { ...(ctx.body?.data ?? {}) };
      const name = String(data.username ?? "").toLowerCase();
      if (!isValidName(name)) {
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_USERNAME",
          message: `Username: use ${NAME_RULE}`,
        });
      }
      return {
        context: {
          body: {
            ...ctx.body,
            data: {
              ...data,
              username: name,
              displayUsername: name,
              mustChangePassword: true,
              invited: !ctx.body?.password,
            },
          },
        },
      };
    }
    case "/reset-password": {
      const token = ctx.body?.token ?? ctx.query?.token;
      if (!ctx.request || !token) {
        return;
      }
      const verification =
        await ctx.context.internalAdapter.findVerificationValue(
          `reset-password:${token}`,
        );
      if (verification && (await isInvited(verification.value))) {
        redeemingInvite.set(ctx.request, verification.value);
      }
      return;
    }
    case "/admin/set-role":
      if (ctx.body?.role !== "admin") {
        await assertNotLastAdmin(String(ctx.body?.userId));
      }
      return;
    case "/admin/ban-user":
    case "/admin/remove-user":
      await assertNotLastAdmin(String(ctx.body?.userId));
      return;
  }
});

const afterHook = createAuthMiddleware(async (ctx) => {
  if (ctx.context.returned instanceof Error) {
    return;
  }
  if (ctx.path === "/admin/create-user" && !ctx.body?.password) {
    const { user } = ctx.context.returned as {
      user: { id: string; name: string; email: string };
    };
    await sendInvite(ctx.context, user);
  }
  const invitee = ctx.request && redeemingInvite.get(ctx.request);
  if (ctx.path === "/reset-password" && invitee) {
    const session = await ctx.context.internalAdapter.createSession(invitee);
    const user = await ctx.context.internalAdapter.findUserById(invitee);
    if (user) {
      await setSessionCookie(ctx, { session, user });
      log.info("invite accepted", { userId: invitee });
    }
  }
  if (ctx.path === "/admin/set-user-password") {
    await passwordSet(String(ctx.body?.userId), true);
  }
  if (ctx.path === "/change-password" && ctx.context.session) {
    await passwordSet(ctx.context.session.user.id, false);
  }
});

function createAuth() {
  const {
    BETTER_AUTH_SECRET,
    FRONTEND_CANONICAL_BASE_URL,
    AUTH_ALLOWED_HOSTS,
  } = env as unknown as AuthEnv;
  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    baseURL: {
      allowedHosts: allowedHosts(
        FRONTEND_CANONICAL_BASE_URL,
        AUTH_ALLOWED_HOSTS,
      ),
      fallback: FRONTEND_CANONICAL_BASE_URL,
    },
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: authSchema,
    }),
    user: {
      additionalFields: {
        mustChangePassword: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
        invited: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    session: { modelName: "user_sessions" },
    account: { modelName: "user_accounts" },
    verification: { modelName: "user_verifications" },
    ...emailOptions(),
    hooks: { before: beforeHook, after: afterHook },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 39,
        usernameValidator: isValidName,
      }),
      admin(),
      apiKey({
        schema: { apikey: { modelName: "api_keys" } },
        enableMetadata: true,
        defaultPrefix: PERSONAL_KEY_PREFIX,
        // The prefix plus five characters, enough to tell keys apart in a list.
        startingCharactersConfig: { charactersLength: 14 },
        rateLimit: { enabled: false },
        keyExpiration: { defaultExpiresIn: null, maxExpiresIn: 366 },
      }),
    ],
    advanced: {
      database: { generateId: generateAuthId },
    },
  });
}

export function getAuth(): AppAuth {
  cached ??= createAuth();
  return cached;
}
