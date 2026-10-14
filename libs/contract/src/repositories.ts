import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  branchInfoSchema,
  changedFileContentsSchema,
  commitDetailSchema,
  commitHashSchema,
  commitSchema,
  MAX_COMMITS_PAGE,
  pathContentsSchema,
} from "./files";
import { nameSchema } from "./names";
import { userSummarySchema } from "./account";
import { githubRepositoryRefSchema } from "./github";

export const ACCESS_LEVELS = ["read", "write", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const branchSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+(?<![./])$/, {
    error: "Use a valid git branch name",
  });

export const repositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  defaultBranch: z.string(),
  level: z.enum(ACCESS_LEVELS),
  cloneUrl: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Repository = z.infer<typeof repositorySchema>;

// A repository as the repository list shows it.
export const repositoryListItemSchema = repositorySchema.extend({
  stats: z.object({
    openPullRequests: z.number(),
    activeSessions: z.number(),
    members: z.number(),
    github: z.object({ owner: z.string(), repo: z.string() }).nullable(),
  }),
});
export type RepositoryListItem = z.infer<typeof repositoryListItemSchema>;

export const repositoryDetailSchema = repositorySchema.extend({
  // Null when the default branch has no commits yet, or git hosting is off.
  head: z.string().nullable(),
});
export type RepositoryDetail = z.infer<typeof repositoryDetailSchema>;

export const memberSchema = z.object({
  user: userSummarySchema,
  level: z.enum(ACCESS_LEVELS),
});

export const agentGrantSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  ownerUserId: z.string(),
  granted: z.enum(ACCESS_LEVELS),
  // What the agent can actually do: never more than its owner.
  effective: z.enum(ACCESS_LEVELS).nullable(),
});

const byName = z.object({ name: z.string() });
const ok = z.object({ ok: z.literal(true) });

export const repositoriesContract = {
  list: oc
    .route({ method: "GET", path: "/api/repositories" })
    .output(z.array(repositoryListItemSchema)),
  create: oc
    .route({ method: "POST", path: "/api/repositories" })
    .input(
      z.object({
        name: nameSchema,
        description: z.string().trim().max(500).nullable().optional(),
        defaultBranch: branchSchema.optional(),
      }),
    )
    .output(repositorySchema),
  // A new repository mirroring a GitHub repository, read with one of the
  // caller's GitHub tokens.
  import: oc
    .route({ method: "POST", path: "/api/repositories/import" })
    .input(
      githubRepositoryRefSchema.extend({
        name: nameSchema,
        description: z.string().trim().max(500).nullable().optional(),
        tokenId: z.string(),
      }),
    )
    .output(repositorySchema),
  get: oc
    .route({ method: "GET", path: "/api/repositories/{name}" })
    .input(byName)
    .output(repositoryDetailSchema),
  // What path names at ref (a branch or commit; the default branch when
  // left out). The root when path is empty.
  contents: oc
    .route({ method: "GET", path: "/api/repositories/{name}/contents" })
    .input(
      byName.extend({
        ref: z.string().min(1).max(200).optional(),
        path: z.string().max(1000).default(""),
      }),
    )
    .output(pathContentsSchema),
  // Every file path at ref (a branch or commit; the default branch when
  // left out), for finding a file. A very large tree is cut short.
  files: oc
    .route({ method: "GET", path: "/api/repositories/{name}/files" })
    .input(byName.extend({ ref: z.string().min(1).max(200).optional() }))
    .output(z.object({ paths: z.array(z.string()), truncated: z.boolean() })),
  // Every branch, the default one first.
  branches: oc
    .route({ method: "GET", path: "/api/repositories/{name}/branches" })
    .input(byName)
    .output(z.array(branchInfoSchema)),
  // A page of ref's history (a branch or commit; the default branch when left
  // out), newest first.
  commits: oc
    .route({ method: "GET", path: "/api/repositories/{name}/commits" })
    .input(
      byName.extend({
        ref: z.string().min(1).max(200).optional(),
        offset: z.coerce.number<number>().int().min(0).default(0),
        limit: z.coerce
          .number<number>()
          .int()
          .min(1)
          .max(MAX_COMMITS_PAGE)
          .default(30),
      }),
    )
    .output(z.object({ commits: z.array(commitSchema), hasMore: z.boolean() })),
  // One commit and the files it changes against its first parent.
  commit: oc
    .route({ method: "GET", path: "/api/repositories/{name}/commits/{hash}" })
    .input(byName.extend({ hash: commitHashSchema }))
    .output(commitDetailSchema),
  // A file the commit changes, before and after it.
  commitFile: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/commits/{hash}/file",
    })
    .input(
      byName.extend({
        hash: commitHashSchema,
        path: z.string().min(1).max(1000),
      }),
    )
    .output(changedFileContentsSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/repositories/{name}" })
    .input(
      byName.extend({
        newName: nameSchema.optional(),
        description: z.string().trim().max(500).nullable().optional(),
        defaultBranch: branchSchema.optional(),
      }),
    )
    .output(repositorySchema),
  delete: oc
    .route({ method: "DELETE", path: "/api/repositories/{name}" })
    .input(byName)
    .output(ok),
  members: {
    list: oc
      .route({ method: "GET", path: "/api/repositories/{name}/members" })
      .input(byName)
      .output(
        z.object({
          members: z.array(memberSchema),
          agents: z.array(agentGrantSchema),
        }),
      ),
    set: oc
      .route({
        method: "PUT",
        path: "/api/repositories/{name}/members/{userId}",
      })
      .input(
        byName.extend({ userId: z.string(), level: z.enum(ACCESS_LEVELS) }),
      )
      .output(ok),
    remove: oc
      .route({
        method: "DELETE",
        path: "/api/repositories/{name}/members/{userId}",
      })
      .input(byName.extend({ userId: z.string() }))
      .output(ok),
  },
};

export { branchSchema };
