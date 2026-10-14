import { oc } from "@orpc/contract";
import { z } from "zod";
import { nameSchema } from "./names";
import { createdKeySchema, createKeyInputSchema, keySchema } from "./account";
import { ACCESS_LEVELS } from "./repositories";

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.number(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentAccessSchema = z.object({
  repository: z.string(),
  level: z.enum(ACCESS_LEVELS),
});

export const agentDetailSchema = agentSchema.extend({
  keys: z.array(keySchema),
  access: z.array(agentAccessSchema),
});
export type AgentDetail = z.infer<typeof agentDetailSchema>;

const byName = z.object({ name: z.string() });
const ok = z.object({ ok: z.literal(true) });

export const agentsContract = {
  list: oc
    .route({ method: "GET", path: "/api/agents" })
    .output(z.array(agentSchema)),
  create: oc
    .route({ method: "POST", path: "/api/agents" })
    .input(
      z.object({
        name: nameSchema,
        description: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .output(agentSchema),
  get: oc
    .route({ method: "GET", path: "/api/agents/{name}" })
    .input(byName)
    .output(agentDetailSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/agents/{name}" })
    .input(byName.extend({ active: z.boolean() }))
    .output(agentSchema),
  delete: oc
    .route({ method: "DELETE", path: "/api/agents/{name}" })
    .input(byName)
    .output(ok),
  keys: {
    create: oc
      .route({ method: "POST", path: "/api/agents/{agent}/keys" })
      .input(createKeyInputSchema.extend({ agent: z.string() }))
      .output(createdKeySchema),
    revoke: oc
      .route({ method: "DELETE", path: "/api/agents/{agent}/keys/{id}" })
      .input(z.object({ agent: z.string(), id: z.string() }))
      .output(ok),
  },
  setAccess: oc
    .route({ method: "PUT", path: "/api/agents/{agent}/access/{repository}" })
    .input(
      z.object({
        agent: z.string(),
        repository: z.string(),
        // Null removes the agent's access.
        level: z.enum(ACCESS_LEVELS).nullable(),
      }),
    )
    .output(ok),
};
