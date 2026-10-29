import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  listPageSchema,
  listQuerySchema,
  searchQuerySchema,
  searchResultsSchema,
} from "./listing";
import { nameSchema } from "./names";

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SETUP_STATES = ["open", "closed", "unconfigured"] as const;

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  role: z.enum(ROLES),
  mustChangePassword: z.boolean(),
  // Set when the request came with an agent's API key.
  agent: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type Me = z.infer<typeof meSchema>;

export const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  role: z.enum(ROLES),
  active: z.boolean(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const keySchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.string().nullable(),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
});
export type ApiKey = z.infer<typeof keySchema>;

export const createKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(366).nullable(),
});

export const createdKeySchema = z.object({
  key: keySchema,
  // Shown once; only a hash is stored.
  plaintext: z.string(),
});

export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SETUP_TOKEN_LENGTH = 4;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(128);

export const setupContract = {
  state: oc
    .route({ method: "GET", path: "/api/setup" })
    .output(z.object({ state: z.enum(SETUP_STATES) })),
  create: oc
    .route({ method: "POST", path: "/api/setup" })
    .input(
      z.object({
        token: z.string().min(1),
        username: nameSchema,
        name: z.string().trim().min(1).max(100),
        email: z.email(),
        password: passwordSchema,
      }),
    )
    .output(z.object({ ok: z.literal(true) })),
};

export const accountContract = {
  me: oc.route({ method: "GET", path: "/api/me" }).output(meSchema),
  // The first active users whose name, username or email between them hold
  // every word of `q`, by name: who can be added to a repository.
  searchUsers: oc
    .route({ method: "GET", path: "/api/search/users" })
    .input(searchQuerySchema)
    .output(searchResultsSchema(userSummarySchema)),
  keys: {
    // The caller's personal keys, newest first; `q` keeps those whose name
    // holds every word of it.
    list: oc
      .route({ method: "GET", path: "/api/account/keys" })
      .input(
        listQuerySchema(keySchema, {
          sorts: ["createdAt"],
          filters: {},
          defaultDir: "desc",
        }),
      )
      .output(listPageSchema(keySchema)),
    create: oc
      .route({ method: "POST", path: "/api/account/keys" })
      .input(createKeyInputSchema)
      .output(createdKeySchema),
    revoke: oc
      .route({ method: "DELETE", path: "/api/account/keys/{id}" })
      .input(z.object({ id: z.string() }))
      .output(z.object({ ok: z.literal(true) })),
  },
};
